import { createClient } from '@/utils/supabase/server';
import TabsClient from './TabsClient';

export default async function ClientTabsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await searchParams;

  let initialClient: { id: string; name: string } | null = null;

  if (clientId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('id', clientId)
      .single();
    if (data) {
      initialClient = { id: data.id, name: `${data.first_name} ${data.last_name}` };
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50 p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Client Tabs</h1>
        <p className="text-sm text-slate-500 mt-1">
          Search for a client to view their visit charges, parked sales, and payment history.
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <TabsClient initialClient={initialClient} />
      </div>
    </div>
  );
}
