'use server';

import { createClient } from '@/utils/supabase/server';
import { getOpenSession } from '@/utils/pos-session';
import { logPOSAction } from '@/utils/pos-audit';
import { revalidatePath } from 'next/cache';

async function getOrgAndUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return null;
  return { supabase, user, orgId: profile.organization_id as string };
}

export async function openPOS(openingCash: number) {
  const ctx = await getOrgAndUser();
  if (!ctx) return { error: 'Unauthorized' };
  const { supabase, user, orgId } = ctx;

  // Guard: only one open session at a time
  const existing = await getOpenSession(orgId, supabase);
  if (existing) return { error: 'POS is already open.' };

  const { error } = await supabase.from('pos_sessions').insert({
    organization_id: orgId,
    opening_cash: Math.max(0, openingCash),
    opened_by_email: user.email ?? null,
  });

  if (error) return { error: error.message };

  await logPOSAction(supabase, orgId, user.email ?? null, 'open_session', null, {
    opening_cash: Math.max(0, openingCash),
  });

  revalidatePath('/pos');
  return { success: true };
}

export async function closePOS() {
  const ctx = await getOrgAndUser();
  if (!ctx) return { error: 'Unauthorized' };
  const { supabase, user, orgId } = ctx;

  const session = await getOpenSession(orgId, supabase);
  if (!session) return { error: 'No open session found.' };

  const { error } = await supabase
    .from('pos_sessions')
    .update({ closed_at: new Date().toISOString(), closed_by_email: user.email ?? null })
    .eq('id', session.id);

  if (error) return { error: error.message };

  await logPOSAction(supabase, orgId, user.email ?? null, 'close_session', null, {
    session_id: session.id,
    opened_at: session.opened_at,
  });

  revalidatePath('/pos');
  return { success: true };
}

export async function getSessionPageData() {
  const ctx = await getOrgAndUser();
  if (!ctx) return null;
  const { supabase, orgId } = ctx;

  const openSession = await getOpenSession(orgId, supabase);

  // Last closed session for reference
  const { data: lastClosed } = await supabase
    .from('pos_sessions')
    .select('closed_at, closed_by_email, opening_cash, opened_at')
    .eq('organization_id', orgId)
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Payment summary for the open session
  let summary: { method: string; total: number }[] = [];
  let transactionCount = 0;

  if (openSession) {
    // Get all invoice IDs for this org
    const { data: orgInvoices } = await supabase
      .from('pos_invoices')
      .select('id')
      .eq('organization_id', orgId);

    const invoiceIds = (orgInvoices ?? []).map((i: any) => i.id as string);

    if (invoiceIds.length > 0) {
      const { data: payments } = await supabase
        .from('pos_payments')
        .select('payment_method, amount')
        .in('invoice_id', invoiceIds)
        .is('voided_at', null)
        .gte('created_at', openSession.opened_at);

      const totals: Record<string, number> = {};
      for (const p of payments ?? []) {
        totals[p.payment_method] = Math.round(((totals[p.payment_method] ?? 0) + Number(p.amount)) * 100) / 100;
      }
      summary = Object.entries(totals)
        .map(([method, total]) => ({ method, total }))
        .sort((a, b) => b.total - a.total);
      transactionCount = (payments ?? []).length;
    }
  }

  return {
    openSession,
    lastClosed: lastClosed ?? null,
    summary,
    transactionCount,
  };
}
