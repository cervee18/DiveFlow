import type { SupabaseClient } from '@supabase/supabase-js';

export async function logPOSAction(
  supabase: SupabaseClient,
  orgId: string,
  actorEmail: string | null,
  action: string,
  clientId: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabase.from('pos_audit_log').insert({
    organization_id: orgId,
    actor_email: actorEmail,
    action,
    client_id: clientId || null,
    metadata,
  });
  if (error && process.env.NODE_ENV !== 'production') {
    console.warn('[pos-audit] insert failed:', error.message);
  }
}
