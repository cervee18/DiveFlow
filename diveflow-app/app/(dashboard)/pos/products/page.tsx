import { createClient } from "@/utils/supabase/server";
import ProductsClient from "./ProductsClient";

export default async function POSProductsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  const [productsRes, categoriesRes, tripsRes, coursesRes, rentalsRes, orgRes, tiersRes] = await Promise.all([
    supabase
      .from('pos_products')
      .select('*, pos_categories(name), course_id')
      .eq('organization_id', profile.organization_id)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true }),

    supabase
      .from('pos_categories')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('name', { ascending: true }),

    supabase
      .from('trip_types')
      .select('id, name, billing_via_activity, pos_products(id, price)')
      .eq('organization_id', profile.organization_id)
      .order('name'),

    supabase.from('courses').select('id, name, included_trips').order('name'),

    supabase
      .from('pos_rental_mappings')
      .select('rental_field, pos_products(id, price)')
      .eq('organization_id', profile.organization_id),

    supabase
      .from('organizations')
      .select('private_instruction_product_id, rental_daily_cap, pos_products(price)')
      .eq('id', profile.organization_id)
      .single(),

    supabase
      .from('trip_pricing_tiers')
      .select('trip_type_id, min_qty, unit_price')
      .eq('organization_id', profile.organization_id)
      .order('min_qty', { ascending: true }),
  ]);

  const products = productsRes.data ?? [];
  const categories = categoriesRes.data ?? [];

  const orgData = orgRes.data as any;
  const privateInstructionPrice: string =
    orgData?.pos_products?.price != null
      ? Number(orgData.pos_products.price).toFixed(2)
      : '';
  const rentalDailyCap: string =
    orgData?.rental_daily_cap != null
      ? Number(orgData.rental_daily_cap).toFixed(2)
      : '';

  // Group tiers by trip_type_id
  const tiersMap: Record<string, { min_qty: number; unit_price: number }[]> = {};
  for (const t of tiersRes.data ?? []) {
    if (!tiersMap[t.trip_type_id]) tiersMap[t.trip_type_id] = [];
    tiersMap[t.trip_type_id].push({ min_qty: t.min_qty, unit_price: t.unit_price });
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col min-h-screen">
      <ProductsClient
        products={products}
        categories={categories}
        tripTypes={tripsRes.data ?? []}
        courses={coursesRes.data ?? []}
        rentalMappings={rentalsRes.data ?? []}
        privateInstructionPrice={privateInstructionPrice}
        rentalDailyCap={rentalDailyCap}
        tiersMap={tiersMap}
      />
    </div>
  );
}
