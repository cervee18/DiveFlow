'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export async function fetchLiveInvoice(visitId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // Call the Postgres RPC
  const { data, error } = await supabase.rpc('calculate_visit_invoice_payload', {
    p_visit_id: visitId
  });

  if (error) return { error: error.message };
  return { data };
}

export async function addManualItem(visitId: string, invoiceId: string | null, productId: string, clientId: string | null, price: number, qty: number = 1) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  let activeInvoiceId = invoiceId;
  
  // If invoice doesn't exist yet, create it
  if (!activeInvoiceId) {
    const { data: inv, error: invErr } = await supabase.from('pos_invoices').insert({
      organization_id: profile.organization_id,
      visit_id: visitId
    }).select().single();
    if (invErr) return { error: invErr.message };
    activeInvoiceId = inv.id;
  }

  // Insert line item
  const { error } = await supabase.from('pos_invoice_items').insert({
    invoice_id: activeInvoiceId,
    pos_product_id: productId,
    client_id: clientId || null,
    quantity: qty,
    unit_price: price
  });

  if (error) return { error: error.message };
  
  revalidatePath('/pos/sell');
  return { success: true };
}

export async function addPayment(visitId: string, invoiceId: string | null, amount: number, method: string, clientId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  let activeInvoiceId = invoiceId;
  
  if (!activeInvoiceId) {
    const { data: inv, error: invErr } = await supabase.from('pos_invoices').insert({
      organization_id: profile.organization_id,
      visit_id: visitId
    }).select().single();
    if (invErr) return { error: invErr.message };
    activeInvoiceId = inv.id;
  }

  const { error } = await supabase.from('pos_payments').insert({
    invoice_id: activeInvoiceId,
    amount,
    payment_method: method,
    client_id: clientId || null,
    recorded_by: user.id
  });

  if (error) return { error: error.message };
  
  revalidatePath('/pos/sell');
  return { success: true };
}

export async function checkoutSession(
  visitId: string | null, 
  invoiceId: string | null, 
  clientId: string | null, 
  items: { id: string, price: number, qty: number }[],
  paymentAmount: number,
  paymentMethod: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  let activeInvoiceId = invoiceId;

  if (!activeInvoiceId) {
    if (visitId) {
      // Visit-based: find or create one invoice per visit
      const { data: existing } = await supabase.from('pos_invoices').select('id').eq('visit_id', visitId).maybeSingle();
      if (existing) {
        activeInvoiceId = existing.id;
      } else {
        const { data: inv, error: invErr } = await supabase.from('pos_invoices').insert({
          organization_id: profile.organization_id,
          visit_id: visitId,
          client_id: clientId || null
        }).select().single();
        if (invErr) return { error: invErr.message };
        activeInvoiceId = inv.id;
      }
    } else {
      // Terminal sale (no visit) — always create a fresh invoice per session
      const { data: inv, error: invErr } = await supabase.from('pos_invoices').insert({
        organization_id: profile.organization_id,
        visit_id: null,
        client_id: clientId || null
      }).select().single();
      if (invErr) return { error: invErr.message };
      activeInvoiceId = inv.id;
    }
  }

  // Create a transaction record to group items + payment together
  const { data: txn, error: txnErr } = await supabase
    .from('pos_transactions')
    .insert({ invoice_id: activeInvoiceId })
    .select()
    .single();
  if (txnErr) return { error: txnErr.message };
  const transactionId = txn.id;

  // Insert items linked to this transaction
  if (items.length > 0) {
    const payload = items.map(i => ({
      invoice_id: activeInvoiceId,
      transaction_id: transactionId,
      pos_product_id: i.id,
      client_id: clientId || null,
      unit_price: i.price,
      quantity: i.qty
    }));
    await supabase.from('pos_invoice_items').insert(payload);
  }

  // Insert payment linked to this transaction
  if (paymentAmount > 0) {
    await supabase.from('pos_payments').insert({
      invoice_id: activeInvoiceId,
      transaction_id: transactionId,
      amount: paymentAmount,
      payment_method: paymentMethod,
      client_id: clientId || null,
      recorded_by: user.id,
      recorded_by_email: user.email ?? null
    });
  }

  revalidatePath('/pos/sell');
  return { success: true };
}

export async function parkSale(
  label: string,
  clientId: string | null,
  visitId: string | null,
  items: { id: string; price: number; qty: number }[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  const { data: cart, error: cartErr } = await supabase
    .from('pos_parked_carts')
    .insert({ organization_id: profile.organization_id, label, client_id: clientId || null, visit_id: visitId || null, created_by: user.id })
    .select().single();
  if (cartErr) return { error: cartErr.message };

  if (items.length > 0) {
    const { error: itemsErr } = await supabase.from('pos_parked_cart_items').insert(
      items.map(i => ({ cart_id: cart.id, pos_product_id: i.id, quantity: i.qty, unit_price: i.price }))
    );
    if (itemsErr) return { error: itemsErr.message };
  }

  return { data: { id: cart.id } };
}

export async function getParkedCarts() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('pos_parked_carts')
    .select(`id, label, client_id, visit_id, created_at, pos_parked_cart_items(id, quantity, unit_price, pos_products(id, name))`)
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { data };
}

export async function deleteParkedCart(cartId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { error } = await supabase.from('pos_parked_carts').delete().eq('id', cartId);
  if (error) return { error: error.message };
  return { success: true };
}

export async function getClientVisitsForTerminal(clientId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('visit_clients')
    .select('visit_id, visits!inner(id, start_date, end_date)')
    .eq('client_id', clientId);

  if (error) return { error: error.message };

  const visits = (data ?? []).map((row: any) => {
    const v = row.visits as { id: string; start_date: string; end_date: string };
    const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return {
      id: v.id,
      startDate: v.start_date,
      endDate: v.end_date,
      label: `${fmt(v.start_date)} – ${fmt(v.end_date)}`,
    };
  });

  // Sort descending by start_date in JS
  visits.sort((a, b) => (a.startDate > b.startDate ? -1 : 1));

  return { data: visits };
}

export async function addCartToClientTab(
  clientId: string,
  visitId: string | null,
  items: { id: string; price: number; qty: number }[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  let invoiceId: string;

  if (visitId) {
    // Find or create one invoice per visit
    const { data: existing } = await supabase
      .from('pos_invoices')
      .select('id')
      .eq('visit_id', visitId)
      .maybeSingle();
    if (existing) {
      invoiceId = existing.id;
    } else {
      const { data: inv, error: invErr } = await supabase
        .from('pos_invoices')
        .insert({ organization_id: profile.organization_id, visit_id: visitId, client_id: clientId })
        .select()
        .single();
      if (invErr || !inv) return { error: invErr?.message ?? 'Failed to create invoice' };
      invoiceId = inv.id;
    }
  } else {
    // Client-only invoice (no visit): find most recent or create
    const { data: existing } = await supabase
      .from('pos_invoices')
      .select('id')
      .eq('client_id', clientId)
      .is('visit_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      invoiceId = existing.id;
    } else {
      const { data: inv, error: invErr } = await supabase
        .from('pos_invoices')
        .insert({ organization_id: profile.organization_id, visit_id: null, client_id: clientId })
        .select()
        .single();
      if (invErr || !inv) return { error: invErr?.message ?? 'Failed to create invoice' };
      invoiceId = inv.id;
    }
  }

  if (items.length > 0) {
    const { error: itemsErr } = await supabase.from('pos_invoice_items').insert(
      items.map(i => ({
        invoice_id: invoiceId,
        pos_product_id: i.id,
        client_id: clientId,
        quantity: i.qty,
        unit_price: i.price,
      }))
    );
    if (itemsErr) return { error: itemsErr.message };
  }

  revalidatePath('/pos/tabs');
  return { success: true };
}
