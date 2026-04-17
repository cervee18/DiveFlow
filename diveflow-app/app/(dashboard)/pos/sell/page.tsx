import { createClient } from "@/utils/supabase/server";
import SellTerminalClient from "./SellTerminalClient";

export default async function POSSellPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  const orgId = profile?.organization_id;
  if (!orgId) return null;

  // Load Manual POS catalog (T-shirts, etc.)
  const { data: manualProductsRes } = await supabase
    .from('pos_products')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name');

  // Load Categories for the filter pills
  const { data: categoriesRes } = await supabase
    .from('pos_categories')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');

  // Load ALL active clients for the attribution search
  const { data: clientsRes } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .eq('organization_id', orgId)
    .order('last_name');

  const clients = (clientsRes ?? []).map(c => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`
  }));

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50 p-6">
      <div className="mb-4 flex flex-col">
        <h1 className="text-2xl font-bold text-slate-800">Checkout Terminal</h1>
        <p className="text-sm text-slate-500 mt-1">Add products to the cart and collect payment. Optionally attribute the sale to a client.</p>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex">
        <SellTerminalClient
          manualProducts={manualProductsRes ?? []}
          categories={categoriesRes ?? []}
          clients={clients}
        />
      </div>
    </div>
  );
}
