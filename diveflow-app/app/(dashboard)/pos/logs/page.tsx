import { createClient } from '@/utils/supabase/server';
import POSLogsClient from './POSLogsClient';

export default async function POSLogsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  const { data: logs } = await supabase
    .from('pos_audit_log')
    .select('id, action, actor_email, client_id, metadata, created_at, clients(first_name, last_name)')
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (logs ?? []).map((l: any) => ({
    id: l.id as string,
    action: l.action as string,
    actorEmail: (l.actor_email ?? null) as string | null,
    clientId: (l.client_id ?? null) as string | null,
    clientName: l.clients
      ? `${l.clients.first_name} ${l.clients.last_name}`
      : null,
    metadata: (l.metadata ?? {}) as Record<string, unknown>,
    createdAt: l.created_at as string,
  }));

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50 p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">POS Activity Log</h1>
        <p className="text-sm text-slate-500 mt-1">
          Audit trail of all POS actions — payments, waivers, price edits, session open/close.
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <POSLogsClient logs={rows} />
      </div>
    </div>
  );
}
