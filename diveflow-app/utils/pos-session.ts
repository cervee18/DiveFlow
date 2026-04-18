import type { SupabaseClient } from '@supabase/supabase-js';

export interface OpenSession {
  id: string;
  opened_at: string;
  opened_by_email: string | null;
  opening_cash: number;
}

export async function getOpenSession(orgId: string, supabase: SupabaseClient): Promise<OpenSession | null> {
  const { data } = await supabase
    .from('pos_sessions')
    .select('id, opened_at, opened_by_email, opening_cash')
    .eq('organization_id', orgId)
    .is('closed_at', null)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as OpenSession | null;
}
