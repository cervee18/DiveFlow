"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function getAdminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  return data?.organization_id;
}

export async function searchOrganizationUsers(query: string = "") {
  const supabase = await createClient();
  
  // Call the new securely defined DB RPC for global entities
  const { data, error } = await supabase.rpc("search_global_identities", {
    p_query: query
  });
  
  if (error) {
    console.error("Error searching users:", error);
    return [];
  }
  
  return data;
}

export async function addClientToOrganization(userId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase.rpc("add_client_to_organization", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error adding client:", error);
    return { error: error.message };
  }

  revalidatePath("/management");
  return { success: true };
}

export async function promoteToStaff(userId: string, targetRole: string) {
  const supabase = await createClient();
  
  // Execute the safe DB promotion logic
  const { error } = await supabase.rpc("elevate_user_to_staff", {
    p_user_id: userId,
    p_target_role: targetRole,
  });

  if (error) {
    console.error("Error promoting user:", error);
    return { error: error.message };
  }

  revalidatePath("/management");
  return { success: true };
}

export async function getReadOnlyPassport(userId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase.rpc("get_global_passport", {
    p_user_id: userId
  });
  
  if (error) {
    console.error("Error fetching passport:", error);
    return { data: null, error: error.message || JSON.stringify(error) };
  }
  
  return { data, error: null };
}
