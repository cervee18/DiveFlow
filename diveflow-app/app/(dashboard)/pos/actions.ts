'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createCategory(name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No organization' };

  const { data, error } = await supabase.from('pos_categories').insert({
    organization_id: profile.organization_id,
    name
  }).select().single();

  if (error) return { error: error.message };
  revalidatePath('/pos/products');
  return { data };
}

export async function upsertProduct(payload: {
  id?: string;
  name: string;
  description?: string;
  category_id?: string;
  price: number;
  is_automated: boolean;
  is_active: boolean;
  course_id?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No organization' };

  // Ensure undefined strings turn to null for db
  const dbPayload = {
    organization_id: profile.organization_id,
    name: payload.name,
    description: payload.description || null,
    category_id: payload.category_id || null,
    price: payload.price,
    is_automated: payload.is_automated,
    is_active: payload.is_active,
    course_id: payload.course_id || null,
  };

  let res;
  if (payload.id) {
    res = await supabase.from('pos_products').update(dbPayload).eq('id', payload.id).select().single();
  } else {
    res = await supabase.from('pos_products').insert(dbPayload).select().single();
  }

  if (res.error) return { error: res.error.message };
  revalidatePath('/pos/products');
  return { data: res.data };
}
// ── Internal helper ──────────────────────────────────────────────────────────
// Finds an existing category by name (case-insensitive) or creates a new one.
// Returns the category id, or null on failure.
async function findOrCreateCategory(
  supabase: Awaited<ReturnType<typeof import('@/utils/supabase/server').createClient>>,
  orgId: string,
  categoryName: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('pos_categories')
    .select('id')
    .eq('organization_id', orgId)
    .ilike('name', categoryName)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created } = await supabase
    .from('pos_categories')
    .insert({ organization_id: orgId, name: categoryName })
    .select('id')
    .single();

  return created?.id ?? null;
}

export async function setTripTypePrice(id: string, name: string, priceStr: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return;

  const { data: trip } = await supabase.from('trip_types').select('pos_product_id').eq('id', id).single();
  
  if (!priceStr.trim()) {
    if (trip?.pos_product_id) {
       await supabase.from('trip_types').update({ pos_product_id: null }).eq('id', id);
    }
  } else {
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) return;
    
    if (trip?.pos_product_id) {
       await supabase.from('pos_products').update({ price }).eq('id', trip.pos_product_id);
    } else {
       const categoryId = await findOrCreateCategory(supabase, profile.organization_id, 'Trip');
       const { data: prod } = await supabase.from('pos_products').insert({
         organization_id: profile.organization_id,
         category_id: categoryId,
         name: `Trip: ${name}`,
         price,
         is_automated: true
       }).select().single();
       if (prod) {
         await supabase.from('trip_types').update({ pos_product_id: prod.id }).eq('id', id);
       }
    }
  }
  revalidatePath('/pos/settings');
  revalidatePath('/pos/products');
}

export async function setTripTypeBillingMode(id: string, billingViaActivity: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // When switching to activity-billed, clear any fixed price so there's no orphan product
  if (billingViaActivity) {
    const { data: trip } = await supabase.from('trip_types').select('pos_product_id').eq('id', id).single();
    if (trip?.pos_product_id) {
      await supabase.from('trip_types').update({ pos_product_id: null, billing_via_activity: true }).eq('id', id);
    } else {
      await supabase.from('trip_types').update({ billing_via_activity: true }).eq('id', id);
    }
  } else {
    await supabase.from('trip_types').update({ billing_via_activity: false }).eq('id', id);
  }

  revalidatePath('/pos/settings');
  revalidatePath('/pos/products');
}

export async function setPrivateInstructionPrice(priceStr: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return;

  const { data: posConfig } = await supabase
    .from('org_pos_config')
    .select('private_instruction_product_id')
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  if (!priceStr.trim()) {
    // Clear the pointer (but leave the product intact)
    if (posConfig?.private_instruction_product_id) {
      await supabase.from('org_pos_config').update({ private_instruction_product_id: null }).eq('organization_id', profile.organization_id);
    }
  } else {
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) return;

    if (posConfig?.private_instruction_product_id) {
      await supabase.from('pos_products').update({ price }).eq('id', posConfig.private_instruction_product_id);
    } else {
      const categoryId = await findOrCreateCategory(supabase, profile.organization_id, 'Instruction');
      const { data: prod } = await supabase.from('pos_products').insert({
        organization_id: profile.organization_id,
        category_id: categoryId,
        name: 'Private Instruction',
        price,
        is_automated: true,
      }).select().single();
      if (prod) {
        await supabase
          .from('org_pos_config')
          .upsert({ organization_id: profile.organization_id, private_instruction_product_id: prod.id });
      }
    }
  }
  revalidatePath('/pos/settings');
  revalidatePath('/pos/products');
}

export async function setCourseIncludedTrips(id: string, trips: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const safeCount = Math.max(0, Math.round(trips));
  await supabase.from('courses').update({ included_trips: safeCount }).eq('id', id);
  revalidatePath('/pos/products');
}

export async function setRentalPrice(rentalField: string, label: string, priceStr: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return;

  const { data: mapping } = await supabase.from('pos_rental_mappings')
    .select('pos_product_id')
    .eq('organization_id', profile.organization_id)
    .eq('rental_field', rentalField)
    .single();

  if (!priceStr.trim()) {
    if (mapping?.pos_product_id) {
      await supabase.from('pos_rental_mappings')
        .delete()
        .eq('organization_id', profile.organization_id)
        .eq('rental_field', rentalField);
    }
  } else {
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) return;

    if (mapping?.pos_product_id) {
      await supabase.from('pos_products').update({ price }).eq('id', mapping.pos_product_id);
    } else {
      const categoryId = await findOrCreateCategory(supabase, profile.organization_id, 'Rental');
      const { data: prod } = await supabase.from('pos_products').insert({
        organization_id: profile.organization_id,
        category_id: categoryId,
        name: `Rental: ${label}`,
        price,
        is_automated: true
      }).select().single();
      if (prod) {
        await supabase.from('pos_rental_mappings').insert({
          organization_id: profile.organization_id,
          rental_field: rentalField,
          pos_product_id: prod.id
        });
      }
    }
  }
  revalidatePath('/pos/settings');
  revalidatePath('/pos/products');
}

export async function setTripPricingTiers(
  tripTypeId: string,
  tiers: { min_qty: number; unit_price: number }[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  // Replace all tiers for this trip type atomically
  await supabase.from('trip_pricing_tiers').delete().eq('trip_type_id', tripTypeId);

  if (tiers.length > 0) {
    const rows = tiers.map(t => ({
      organization_id: profile.organization_id,
      trip_type_id: tripTypeId,
      min_qty: t.min_qty,
      unit_price: t.unit_price,
    }));
    const { error } = await supabase.from('trip_pricing_tiers').insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath('/pos/products');
  return { success: true };
}

export async function setRentalDailyCap(capStr: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return { error: 'No org' };

  const cap = capStr.trim() ? parseFloat(capStr) : null;
  if (capStr.trim() && (isNaN(cap!) || cap! < 0)) return { error: 'Invalid cap' };

  await supabase
    .from('org_pos_config')
    .upsert({ organization_id: profile.organization_id, rental_daily_cap: cap });

  revalidatePath('/pos/products');
  return { success: true };
}
