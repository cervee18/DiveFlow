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

  // 3. Parked carts for this client
  const { data: parkedCarts } = await supabase
    .from('pos_parked_carts')
    .select(`id, label, created_at, pos_parked_cart_items(id, quantity, unit_price, pos_products(id, name))`)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  // 4. Payment history — payments on visit invoices + walk-in invoices for this client
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
        .select('id, amount, payment_method, created_at, recorded_by_email, client_id, invoice_id, voided_at, void_reason')
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
      .select('id, amount, payment_method, created_at, recorded_by_email, client_id, invoice_id, voided_at, void_reason')
      .in('invoice_id', clientInvoices.map(i => i.id))
      .order('created_at', { ascending: false });
    allPayments.push(...(tPayments ?? []));
  }

  allPayments.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return {
    data: {
      visits: visitPayloads,
      parkedCarts: parkedCarts ?? [],
      payments: allPayments,
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
  enteredAmount: number,
  method: string,
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

  // ── 4. Build per-member payment rows ────────────────────────────────────
  // Payments are attributed to each specific member (client_id set) so the RPC
  // can show each person's individual balance_due going to zero independently.
  // The entered amount is distributed proportionally by each member's balance_due.

  const totalOwed = resolvedVisits.reduce((s, v) => s + v.balance, 0) + parkedTotal;

  // Collect: { invoiceId, clientId, amount }
  type PaymentRow = { invoiceId: string; clientId: string | null; amount: number };
  const paymentRows: PaymentRow[] = [];

  for (const rv of resolvedVisits) {
    if (rv.balance <= 0 || !rv.members || rv.members.length === 0) continue;

    // Each member's proportional share of the entered amount for this visit
    for (const member of rv.members) {
      const memberShare = totalOwed > 0
        ? (member.balanceDue / totalOwed) * enteredAmount
        : 0;
      if (memberShare <= 0) continue;
      paymentRows.push({ invoiceId: rv.invoiceId, clientId: member.clientId, amount: memberShare });
    }
  }

  // Parked cart items (attributed to the tab owner, clientId)
  if (primaryInvoiceId && parkedTotal > 0) {
    const parkedShare = totalOwed > 0
      ? (parkedTotal / totalOwed) * enteredAmount
      : enteredAmount;
    paymentRows.push({ invoiceId: primaryInvoiceId, clientId: clientId, amount: parkedShare });
  }

  // If only one payment row, assign the full entered amount to avoid float drift
  if (paymentRows.length === 1) {
    paymentRows[0].amount = enteredAmount;
  }

  // ── 5. Record one payment row per member ─────────────────────────────────
  for (const row of paymentRows) {
    if (row.amount <= 0) continue;

    const { data: txn, error: txnErr } = await supabase
      .from('pos_transactions').insert({ invoice_id: row.invoiceId }).select().single();
    if (txnErr) return { error: txnErr.message };

    const { error: payErr } = await supabase.from('pos_payments').insert({
      invoice_id: row.invoiceId,
      transaction_id: txn.id,
      amount: row.amount,
      payment_method: method,
      client_id: row.clientId,
      recorded_by: user.id,
      recorded_by_email: user.email ?? null,
    });
    if (payErr) return { error: payErr.message };
  }

  revalidatePath('/pos/tabs');
  return { success: true };
}

export async function voidPayment(paymentId: string, reason: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase
    .from('pos_payments')
    .update({ voided_at: new Date().toISOString(), void_reason: reason || 'Voided by staff' })
    .eq('id', paymentId);

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
