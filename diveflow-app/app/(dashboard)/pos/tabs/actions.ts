'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export async function searchClients(query: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  if (!query || query.trim().length < 2) return { data: [] };

  const { data, error } = await supabase
    .from('clients')
    .select('id, first_name, last_name, email')
    .eq('organization_id', profile.organization_id)
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
    .order('last_name')
    .limit(12);

  if (error) return { error: error.message };
  return { data: (data ?? []).map(c => ({ id: c.id, name: `${c.first_name} ${c.last_name}`, email: c.email })) };
}

export async function getClientTabData(clientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // 1. Find all visits this client is a member of
  const { data: visitMemberships, error: vmErr } = await supabase
    .from('visit_clients')
    .select('visit_id, visits!inner(id, start_date, end_date)')
    .eq('client_id', clientId);

  if (vmErr) return { error: vmErr.message };

  const visits = (visitMemberships ?? []).map((vm: any) => vm.visits as { id: string; start_date: string; end_date: string });
  visits.sort((a, b) => (a.start_date < b.start_date ? 1 : -1));

  // 2. For each visit call the RPC to get invoice payload
  const visitPayloads: { visitId: string; startDate: string; endDate: string; payload: any }[] = [];
  for (const v of visits) {
    const { data: payload } = await supabase.rpc('calculate_visit_invoice_payload', { p_visit_id: v.id });
    if (payload) {
      visitPayloads.push({ visitId: v.id, startDate: v.start_date, endDate: v.end_date, payload });
    }
  }

  // 3. Deposits + credit balance
  const { data: rawDeposits } = await supabase
    .from('client_deposits')
    .select('id, amount, method, note, recorded_by_email, created_at, voided, void_reason')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  const depositsArr = rawDeposits ?? [];
  const activeDepositIds = depositsArr.filter((d: any) => !d.voided).map((d: any) => d.id as string);

  let totalApplied = 0;
  if (activeDepositIds.length > 0) {
    const { data: apps } = await supabase
      .from('deposit_applications')
      .select('amount_applied')
      .in('deposit_id', activeDepositIds);
    totalApplied = (apps ?? []).reduce((s: number, a: any) => s + Number(a.amount_applied), 0);
  }

  const totalDeposited = depositsArr
    .filter((d: any) => !d.voided)
    .reduce((s: number, d: any) => s + Number(d.amount), 0);

  const creditBalance = Math.round((totalDeposited - totalApplied) * 100) / 100;

  const deposits = depositsArr.map((d: any) => ({
    id: d.id as string,
    amount: Number(d.amount),
    method: d.method as string,
    note: (d.note ?? null) as string | null,
    recordedByEmail: (d.recorded_by_email ?? null) as string | null,
    createdAt: d.created_at as string,
    voided: d.voided as boolean,
    voidReason: (d.void_reason ?? null) as string | null,
  }));

  // 4. Standalone invoices (no visit) — items added directly to client tab
  const { data: rawStandaloneInvoices } = await supabase
    .from('pos_invoices')
    .select(`
      id, created_at, status,
      pos_transactions ( id, recorded_by_email, created_at ),
      pos_invoice_items ( id, quantity, unit_price, transaction_id, pos_products ( id, name ) ),
      pos_payments ( id, amount, voided_at )
    `)
    .eq('client_id', clientId)
    .is('visit_id', null)
    .order('created_at', { ascending: false });

  const standaloneInvoices = (rawStandaloneInvoices ?? []).map((inv: any) => {
    const allItems: any[] = inv.pos_invoice_items ?? [];
    const transactions: any[] = [...(inv.pos_transactions ?? [])].sort(
      (a: any, b: any) => a.created_at < b.created_at ? -1 : 1
    );

    // Group items by transaction, then collect unlinked items as a fallback batch
    const batches: { recordedByEmail: string | null; addedAt: string; items: { name: string; price: number; qty: number }[] }[] = [];
    for (const txn of transactions) {
      const txnItems = allItems
        .filter((i: any) => i.transaction_id === txn.id)
        .map((i: any) => ({ name: i.pos_products?.name ?? 'Unknown', price: Number(i.unit_price), qty: i.quantity }));
      if (txnItems.length > 0) {
        batches.push({ recordedByEmail: txn.recorded_by_email ?? null, addedAt: txn.created_at, items: txnItems });
      }
    }
    // Legacy items with no transaction_id
    const unlinked = allItems
      .filter((i: any) => !i.transaction_id)
      .map((i: any) => ({ name: i.pos_products?.name ?? 'Unknown', price: Number(i.unit_price), qty: i.quantity }));
    if (unlinked.length > 0) {
      batches.unshift({ recordedByEmail: null, addedAt: inv.created_at, items: unlinked });
    }

    const subtotal = allItems.reduce((s: number, i: any) => s + Number(i.unit_price) * i.quantity, 0);
    const paid = (inv.pos_payments ?? [])
      .filter((p: any) => !p.voided_at)
      .reduce((s: number, p: any) => s + Number(p.amount), 0);

    return {
      invoiceId: inv.id,
      createdAt: inv.created_at,
      batches,
      subtotal: Math.round(subtotal * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      balance: Math.round((subtotal - paid) * 100) / 100,
    };
  });

  // 6. Payment history — payments on visit invoices + walk-in invoices for this client
  const visitIds = visits.map(v => v.id);
  const allPayments: any[] = [];

  if (visitIds.length > 0) {
    const { data: visitInvoices } = await supabase
      .from('pos_invoices')
      .select('id')
      .in('visit_id', visitIds);

    if (visitInvoices && visitInvoices.length > 0) {
      const { data: vPayments } = await supabase
        .from('pos_payments')
        .select('id, amount, payment_method, created_at, recorded_by_email, client_id, invoice_id, voided_at, void_reason, payment_group_id')
        .in('invoice_id', visitInvoices.map(i => i.id))
        .order('created_at', { ascending: false });
      allPayments.push(...(vPayments ?? []));
    }
  }

  // Walk-in invoices attributed to this client
  const { data: clientInvoices } = await supabase
    .from('pos_invoices')
    .select('id')
    .eq('client_id', clientId)
    .is('visit_id', null);

  if (clientInvoices && clientInvoices.length > 0) {
    const { data: tPayments } = await supabase
      .from('pos_payments')
      .select('id, amount, payment_method, created_at, recorded_by_email, client_id, invoice_id, voided_at, void_reason, payment_group_id')
      .in('invoice_id', clientInvoices.map(i => i.id))
      .order('created_at', { ascending: false });
    allPayments.push(...(tPayments ?? []));
  }

  allPayments.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  // ── 7. Build history: one entry per invoice, payments nested inside ──────────
  // Group all raw payments by invoice_id first.
  const rawByInvoice: Record<string, typeof allPayments> = {};
  for (const p of allPayments) {
    if (!rawByInvoice[p.invoice_id]) rawByInvoice[p.invoice_id] = [];
    rawByInvoice[p.invoice_id].push(p);
  }

  const history = Object.entries(rawByInvoice).map(([invoiceId, rawPayments]) => {
    // Collapse payment_group_id rows into one display row per "Pay" action
    const paymentRows: any[] = [];
    const seenGroups = new Set<string>();
    for (const p of [...rawPayments].sort((a, b) => a.created_at < b.created_at ? -1 : 1)) {
      if (!p.payment_group_id) {
        paymentRows.push({
          ids: [p.id], date: p.created_at, amount: Number(p.amount),
          method: p.payment_method, recordedByEmail: p.recorded_by_email,
          voided: !!p.voided_at, voidReason: p.void_reason ?? null,
        });
      } else if (!seenGroups.has(p.payment_group_id)) {
        seenGroups.add(p.payment_group_id);
        const siblings = rawPayments.filter(x => x.payment_group_id === p.payment_group_id);
        const allVoided = siblings.every(x => !!x.voided_at);
        paymentRows.push({
          ids: siblings.map(x => x.id),
          date: p.created_at,
          amount: Math.round(siblings.reduce((s, x) => s + Number(x.amount), 0) * 100) / 100,
          method: p.payment_method,
          recordedByEmail: p.recorded_by_email,
          voided: allVoided,
          voidReason: allVoided ? (p.void_reason ?? null) : null,
        });
      }
    }

    // Resolve items + context from visit payload or standalone invoice
    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    let context: string | null = null;
    let items: { name: string; price: number; clientName: string | null }[] = [];

    const visitPayload = visitPayloads.find(v => v.payload.invoice_id === invoiceId);
    if (visitPayload) {
      const clients = visitPayload.payload.clients ?? {};
      items = Object.values(clients).flatMap((c: any) => [
        ...(c.automated_items ?? []).map((i: any) => ({
          name: i.name, price: Number(i.price), clientName: c.client_name as string,
        })),
        ...(c.manual_items ?? []).map((i: any) => ({
          name: i.name, price: Number(i.price) * (i.qty ?? 1), clientName: c.client_name as string,
        })),
      ]);
      context = `${fmt(visitPayload.startDate)} – ${fmt(visitPayload.endDate)}`;
    } else {
      const standalone = standaloneInvoices.find(i => i.invoiceId === invoiceId);
      if (standalone) {
        items = standalone.batches.flatMap(b =>
          b.items.map(i => ({ name: i.name, price: i.price * i.qty, clientName: null as string | null }))
        );
        context = 'Direct charges';
      }
    }

    const totalCharged = items.reduce((s, i) => s + i.price, 0);
    const totalPaid = Math.round(
      paymentRows.filter(p => !p.voided).reduce((s, p) => s + p.amount, 0) * 100
    ) / 100;

    // Most-recent payment date for sorting
    const lastDate = paymentRows[paymentRows.length - 1]?.date ?? '';

    return { invoiceId, context, items, totalCharged, payments: paymentRows, totalPaid, lastDate };
  });

  // Exclude from history any visit invoice whose balance is still open.
  // If a new trip is added after a visit was paid, the invoice re-enters
  // Charges and should disappear from History until fully settled again.
  const unsettledVisitInvoiceIds = new Set<string>();
  for (const v of visitPayloads) {
    const t = v.payload.grand_totals ?? {};
    if ((t.master_balance ?? 0) > 0 && v.payload.invoice_id) {
      unsettledVisitInvoiceIds.add(v.payload.invoice_id as string);
    }
  }
  const settledHistory = history.filter(h => !unsettledVisitInvoiceIds.has(h.invoiceId));

  // Most recent activity first
  settledHistory.sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));

  return {
    data: {
      // Charges: unpaid only
      // Hide a visit only when it has been actively paid (payments recorded AND balance at zero).
      // Visits with $0 balance but no payments are simply unpriced — they still belong in charges.
      visits: visitPayloads.filter(v => {
        const t = v.payload.grand_totals ?? {};
        const paid = (t.master_paid ?? 0) > 0;
        const settled = (t.master_balance ?? 0) <= 0;
        return !(paid && settled);
      }),
      // Same rule: hide only when actively paid, not merely when balance happens to be zero
      standaloneInvoices: standaloneInvoices.filter(i => !(i.paid > 0 && i.balance <= 0)),
      // History: only fully-settled invoices
      history: settledHistory,
      // Credits
      deposits,
      creditBalance,
    }
  };
}

/**
 * Collect a single payment covering the client's full outstanding bill:
 * — visit balances (one payment per visit invoice that has a balance)
 * — parked carts (items get moved into the primary invoice, carts deleted)
 *
 * Strategy: use the first visit's invoice as the "primary" invoice. If there
 * are no visits, create a standalone client invoice. All parked cart items
 * are migrated into the primary invoice, then the carts are deleted.
 * One payment is recorded per visit invoice proportionally; parked cart
 * items are settled against the primary invoice.
 */
export async function payClientFullTab(
  clientId: string,
  visitSources: Array<{
    visitId: string;
    invoiceId: string | null;
    balance: number;
    members: Array<{ clientId: string; balanceDue: number }>;
  }>,
  parkedCartIds: string[],
  parkedTotal: number,
  splits: Array<{ amount: number; method: string }>,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  const orgId = profile.organization_id;

  // ── 1. Resolve / create invoice for each visit ──────────────────────────
  const resolvedVisits: Array<{ visitId: string; invoiceId: string; balance: number; members: Array<{ clientId: string; balanceDue: number }> }> = [];

  for (const vs of visitSources) {
    if (vs.balance <= 0) continue;

    let invoiceId = vs.invoiceId;

    if (!invoiceId) {
      const { data: existing } = await supabase
        .from('pos_invoices').select('id').eq('visit_id', vs.visitId).maybeSingle();
      if (existing) {
        invoiceId = existing.id;
      } else {
        const { data: inv, error: invErr } = await supabase
          .from('pos_invoices')
          .insert({ organization_id: orgId, visit_id: vs.visitId, client_id: clientId })
          .select().single();
        if (invErr) return { error: invErr.message };
        invoiceId = inv.id;
      }
    }

    resolvedVisits.push({ visitId: vs.visitId, invoiceId: invoiceId!, balance: vs.balance, members: vs.members ?? [] });
  }

  // ── 2. Resolve primary invoice (for parked carts) ───────────────────────
  // Prefer the first visit invoice; fall back to a standalone client invoice.
  let primaryInvoiceId: string | null = resolvedVisits[0]?.invoiceId ?? null;

  if (!primaryInvoiceId && parkedCartIds.length > 0) {
    const { data: inv, error: invErr } = await supabase
      .from('pos_invoices')
      .insert({ organization_id: orgId, visit_id: null, client_id: clientId })
      .select().single();
    if (invErr) return { error: invErr.message };
    primaryInvoiceId = inv.id;
  }

  // ── 3. Move parked cart items into the primary invoice ───────────────────
  if (primaryInvoiceId && parkedCartIds.length > 0) {
    for (const cartId of parkedCartIds) {
      const { data: cartItems } = await supabase
        .from('pos_parked_cart_items')
        .select('pos_product_id, quantity, unit_price')
        .eq('cart_id', cartId);

      if (cartItems && cartItems.length > 0) {
        await supabase.from('pos_invoice_items').insert(
          cartItems.map(i => ({
            invoice_id: primaryInvoiceId,
            pos_product_id: i.pos_product_id,
            client_id: clientId,
            quantity: i.quantity,
            unit_price: i.unit_price,
          }))
        );
      }

      await supabase.from('pos_parked_carts').delete().eq('id', cartId);
    }
  }

  // ── 4. Distribute each payment split proportionally across visit members ─────
  // All splits share one payment_group_id so history collapses them into one row.
  const totalOwed = resolvedVisits.reduce((s, v) => s + v.balance, 0) + parkedTotal;
  const paymentGroupId = crypto.randomUUID();

  type SplitRow = { invoiceId: string; clientId: string | null; amount: number };

  for (const split of splits) {
    if (split.amount <= 0) continue;

    const splitRows: SplitRow[] = [];

    for (const rv of resolvedVisits) {
      if (rv.balance <= 0 || !rv.members || rv.members.length === 0) continue;
      for (const member of rv.members) {
        const memberShare = totalOwed > 0
          ? (member.balanceDue / totalOwed) * split.amount
          : 0;
        if (memberShare <= 0) continue;
        splitRows.push({ invoiceId: rv.invoiceId, clientId: member.clientId, amount: memberShare });
      }
    }

    // Parked cart items (attributed to the tab owner)
    if (primaryInvoiceId && parkedTotal > 0) {
      const parkedShare = totalOwed > 0
        ? (parkedTotal / totalOwed) * split.amount
        : split.amount;
      splitRows.push({ invoiceId: primaryInvoiceId, clientId: clientId, amount: parkedShare });
    }

    // Fix float drift: if exactly one row, assign the full split amount
    if (splitRows.length === 1) splitRows[0].amount = split.amount;

    // ── 5. Record payment rows for this split ──────────────────────────────
    const splitPaymentIds: string[] = [];

    for (const row of splitRows) {
      if (row.amount <= 0) continue;

      const { data: txn, error: txnErr } = await supabase
        .from('pos_transactions').insert({ invoice_id: row.invoiceId }).select().single();
      if (txnErr) return { error: txnErr.message };

      const { data: payment, error: payErr } = await supabase.from('pos_payments').insert({
        invoice_id: row.invoiceId,
        transaction_id: txn.id,
        amount: row.amount,
        payment_method: split.method,
        client_id: row.clientId,
        recorded_by: user.id,
        recorded_by_email: user.email ?? null,
        payment_group_id: paymentGroupId,
      }).select('id').single();
      if (payErr) return { error: payErr.message };
      splitPaymentIds.push(payment.id);
    }

    // ── 6. If this split is Credit, consume deposits FIFO ─────────────────
    if (split.method === 'Credit' && splitPaymentIds.length > 0) {
      const { data: availableDeposits } = await supabase
        .from('client_deposits')
        .select('id, amount')
        .eq('client_id', clientId)
        .eq('organization_id', orgId)
        .eq('voided', false)
        .order('created_at', { ascending: true });

      if (availableDeposits && availableDeposits.length > 0) {
        const depositIds = availableDeposits.map(d => d.id);
        const { data: existingApps } = await supabase
          .from('deposit_applications')
          .select('deposit_id, amount_applied')
          .in('deposit_id', depositIds);

        const appliedMap: Record<string, number> = {};
        for (const app of existingApps ?? []) {
          appliedMap[app.deposit_id] = (appliedMap[app.deposit_id] ?? 0) + Number(app.amount_applied);
        }

        let remaining = split.amount;
        const anchorPaymentId = splitPaymentIds[0];

        for (const deposit of availableDeposits) {
          if (remaining <= 0) break;
          const available = Number(deposit.amount) - (appliedMap[deposit.id] ?? 0);
          if (available <= 0) continue;
          const toApply = Math.min(available, remaining);
          const { error: appErr } = await supabase.from('deposit_applications').insert({
            deposit_id: deposit.id,
            payment_id: anchorPaymentId,
            amount_applied: Math.round(toApply * 100) / 100,
          });
          if (appErr) return { error: appErr.message };
          remaining -= toApply;
        }
      }
    }
  }

  revalidatePath('/pos/tabs');
  return { success: true };
}

export async function voidPayment(paymentIds: string[], reason: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('pos_payments')
    .update({ voided_at: new Date().toISOString(), void_reason: reason || 'Voided by staff' })
    .in('id', paymentIds);

  if (error) return { error: error.message };

  revalidatePath('/pos/tabs');
  return { success: true };
}

export async function deleteParkedCartFromTabs(cartId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase.from('pos_parked_carts').delete().eq('id', cartId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function recordDeposit(
  clientId: string,
  amount: number,
  method: string,
  note: string,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  if (!amount || amount <= 0) return { error: 'Amount must be greater than zero.' };

  const { error } = await supabase.from('client_deposits').insert({
    organization_id: profile.organization_id,
    client_id: clientId,
    amount,
    method,
    note: note.trim() || null,
    recorded_by_email: user.email ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath('/pos/tabs');
  return { success: true };
}

export async function toggleItemWaiver(visitId: string, clientId: string, itemKey: string, waived: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  if (waived) {
    const { error } = await supabase
      .from('pos_auto_item_waivers')
      .upsert({ visit_id: visitId, client_id: clientId, item_key: itemKey });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('pos_auto_item_waivers')
      .delete()
      .eq('visit_id', visitId)
      .eq('client_id', clientId)
      .eq('item_key', itemKey);
    if (error) return { error: error.message };
  }

  revalidatePath('/pos/tabs');
  return { success: true };
}

export async function deleteInvoiceItem(invoiceItemId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('pos_invoice_items')
    .delete()
    .eq('id', invoiceItemId);

  if (error) return { error: error.message };
  revalidatePath('/pos/tabs');
  return { success: true };
}

export async function voidDeposit(depositId: string, reason: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('client_deposits')
    .update({
      voided: true,
      void_reason: reason.trim() || 'Voided by staff',
      voided_at: new Date().toISOString(),
    })
    .eq('id', depositId);

  if (error) return { error: error.message };
  revalidatePath('/pos/tabs');
  return { success: true };
}
