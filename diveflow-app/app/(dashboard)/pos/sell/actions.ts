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
  items: { id: string; price: number; qty: number }[],
  paymentAmount: number,
  paymentMethod: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  const { data, error } = await supabase.rpc('checkout_session', {
    p_org_id:            profile.organization_id,
    p_visit_id:          visitId   ?? null,
    p_invoice_id:        invoiceId ?? null,
    p_client_id:         clientId  ?? null,
    p_items:             items.map(i => ({ product_id: i.id, price: i.price, qty: i.qty })),
    p_payment_amount:    paymentAmount > 0 ? paymentAmount : null,
    p_payment_method:    paymentMethod ?? null,
    p_recorded_by:       user.id,
    p_recorded_by_email: user.email ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath('/pos/sell');
  return { success: true, invoiceId: (data as any)?.invoice_id ?? null };
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

  const { data, error } = await supabase.rpc('add_items_to_client_tab', {
    p_org_id:            profile.organization_id,
    p_client_id:         clientId,
    p_visit_id:          visitId ?? null,
    p_items:             items.map(i => ({ product_id: i.id, price: i.price, qty: i.qty })),
    p_recorded_by:       user.id,
    p_recorded_by_email: user.email ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath('/pos/tabs');
  return { success: true, invoiceId: (data as any)?.invoice_id ?? null };
}
