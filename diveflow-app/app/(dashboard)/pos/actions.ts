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
       const { data: prod } = await supabase.from('pos_products').insert({
         organization_id: profile.organization_id,
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

export async function setActivityPrice(id: string, name: string, priceStr: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return;

  const { data: act } = await supabase.from('activities').select('pos_product_id').eq('id', id).single();
  
  if (!priceStr.trim()) {
    if (act?.pos_product_id) {
       await supabase.from('activities').update({ pos_product_id: null }).eq('id', id);
    }
  } else {
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) return;
    
    if (act?.pos_product_id) {
       await supabase.from('pos_products').update({ price }).eq('id', act.pos_product_id);
    } else {
       const { data: prod } = await supabase.from('pos_products').insert({
         organization_id: profile.organization_id,
         name: `Activity: ${name}`,
         price,
         is_automated: true
       }).select().single();
       if (prod) {
         await supabase.from('activities').update({ pos_product_id: prod.id }).eq('id', id);
       }
    }
  }
  revalidatePath('/pos/settings');
  revalidatePath('/pos/products');
}

export async function setCoursePrice(id: string, name: string, priceStr: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile) return;

  const { data: crs } = await supabase.from('courses').select('pos_product_id').eq('id', id).single();
  
  if (!priceStr.trim()) {
    if (crs?.pos_product_id) {
       await supabase.from('courses').update({ pos_product_id: null }).eq('id', id);
    }
  } else {
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) return;
    
    if (crs?.pos_product_id) {
       await supabase.from('pos_products').update({ price }).eq('id', crs.pos_product_id);
    } else {
       const { data: prod } = await supabase.from('pos_products').insert({
         organization_id: profile.organization_id,
         name: `Course: ${name}`,
         price,
         is_automated: true
       }).select().single();
       if (prod) {
         await supabase.from('courses').update({ pos_product_id: prod.id }).eq('id', id);
       }
    }
  }
  revalidatePath('/pos/settings');
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
      const { data: prod } = await supabase.from('pos_products').insert({
        organization_id: profile.organization_id,
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
