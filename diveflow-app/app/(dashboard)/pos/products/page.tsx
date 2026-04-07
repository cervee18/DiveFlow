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

  // Let's fetch products and categories with their relations
  const [productsRes, categoriesRes, tripsRes, actsRes, coursesRes, rentalsRes] = await Promise.all([
    supabase
      .from('pos_products')
      .select('*, pos_categories(name)')
      .eq('organization_id', profile.organization_id)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true }),
      
    supabase
      .from('pos_categories')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('name', { ascending: true }),

    supabase.from('trip_types').select('id, name, pos_products(id, price)').eq('organization_id', profile.organization_id).order('name'),
    supabase.from('activities').select('id, name, pos_products(id, price)').eq('organization_id', profile.organization_id).order('name'),
    supabase.from('courses').select('id, name, pos_products(id, price)').eq('organization_id', profile.organization_id).order('name'),
    supabase.from('pos_rental_mappings').select('rental_field, pos_products(id, price)').eq('organization_id', profile.organization_id)
  ]);
  
  const products = productsRes.data ?? [];
  const categories = categoriesRes.data ?? [];

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col min-h-screen">
      <ProductsClient 
        products={products} 
        categories={categories} 
        tripTypes={tripsRes.data ?? []}
        activities={actsRes.data ?? []}
        courses={coursesRes.data ?? []}
        rentalMappings={rentalsRes.data ?? []}
      />
    </div>
  );
}
