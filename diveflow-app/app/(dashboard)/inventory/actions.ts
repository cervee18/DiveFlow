"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function getBulkInventory() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bulk_inventory")
    .select(`
      id,
      size,
      quantity,
      category_id,
      notes,
      equipment_categories (
        name
      )
    `)
    .order('category_id');

  if (error) {
    console.error("Error fetching bulk inventory:", error);
    return [];
  }

  // Transform data to make it easier for UI
  return data.map((item: any) => ({
    id: item.id,
    size: item.size,
    quantity: item.quantity,
    categoryId: item.category_id,
    categoryName: item.equipment_categories?.name || "Unknown",
    notes: item.notes,
  }));
}

export async function getEquipmentCategories() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("equipment_categories")
    .select("id, name, sizes")
    .order('name');
  if (error) return [];
  return data;
}

export async function searchSerializedInventory(query: string) {
  if (!query) return [];
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("inventory")
    .select(`
      id,
      name,
      brand,
      model,
      serial_number,
      condition,
      size,
      category_id,
      equipment_categories (name)
    `)
    .or(`serial_number.ilike.%${query}%,name.ilike.%${query}%,brand.ilike.%${query}%,model.ilike.%${query}%`)
    .limit(20);

  if (error) {
    console.error("Error searching serialized inventory:", error);
    return [];
  }
  return data;
}

export async function upsertBulkItem(formData: FormData) {
  const categoryId = formData.get("categoryId") as string;
  const size = formData.get("size") as string;
  const quantityString = formData.get("quantity") as string;
  const quantity = parseInt(quantityString, 10);
  
  if (!categoryId || isNaN(quantity)) return { error: "Invalid input" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.organization_id) return { error: "No organization found" };

  // Check if exists to avoid unique constraint complexities via PostgREST
  const { data: existing } = await supabase
    .from("bulk_inventory")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("category_id", categoryId)
    .eq("size", size || "")
    .maybeSingle();

  let actionError;
  if (existing) {
    const { error } = await supabase
      .from("bulk_inventory")
      .update({ quantity })
      .eq("id", existing.id);
    actionError = error;
  } else {
    const { error } = await supabase
      .from("bulk_inventory")
      .insert({
        organization_id: profile.organization_id,
        category_id: categoryId,
        size: size || "",
        quantity,
      });
    actionError = error;
  }

  if (actionError) {
    console.error("Upsert error:", actionError);
    return { error: actionError.message };
  }

  revalidatePath("/inventory");
  return { success: true };
}

export async function addSerializedItem(formData: FormData) {
  const categoryId = formData.get("categoryId") as string;
  const serialNumber = formData.get("serialNumber") as string;
  const name = formData.get("name") as string;
  const brand = formData.get("brand") as string;

  if (!name || !categoryId || !serialNumber) return { error: "Missing required fields" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.organization_id) return { error: "No organization" };

  const { error } = await supabase
    .from("inventory")
    .insert({
      organization_id: profile.organization_id,
      category_id: categoryId,
      name,
      brand,
      serial_number: serialNumber,
    });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/inventory");
  return { success: true };
}

export async function updateSerializedItem(formData: FormData) {
  const itemId = formData.get("itemId") as string;
  const categoryId = formData.get("categoryId") as string;
  const serialNumber = formData.get("serialNumber") as string;
  const name = formData.get("name") as string;
  const brand = formData.get("brand") as string;
  const condition = formData.get("condition") as string;

  if (!itemId || !name || !categoryId || !serialNumber) return { error: "Missing required fields" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.organization_id) return { error: "No organization" };

  const { error } = await supabase
    .from("inventory")
    .update({
      category_id: categoryId,
      name,
      brand,
      serial_number: serialNumber,
      condition,
    })
    .eq("id", itemId)
    .eq("organization_id", profile.organization_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/inventory");
  return { success: true };
}
