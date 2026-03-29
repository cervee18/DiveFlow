"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function searchOrganizationUsers(query: string = "") {
  const supabase = await createClient();
  
  // Call the new securely defined DB RPC
  const { data, error } = await supabase.rpc("search_organization_users", {
    p_query: query
  });
  
  if (error) {
    console.error("Error searching users:", error);
    return [];
  }
  
  return data;
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
