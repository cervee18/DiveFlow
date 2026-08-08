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
    return { data: [], error: error.message || JSON.stringify(error) };
  }
  
  return { data, error: null };
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

export async function getOrganizationStaff(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_organization_staff", {
    p_org_id: orgId,
  });

  if (error) {
    console.error("Error fetching staff:", error);
    return { data: [], error: error.message };
  }

  return { data, error: null };
}

export async function updateCaptainLicense(staffId: string, captainLicense: boolean) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_staff_captain_license", {
    p_staff_id: staffId,
    p_captain_license: captainLicense,
  });

  if (error) {
    console.error("Error updating captain license:", error);
    return { error: error.message };
  }

  return { success: true };
}

export async function updateStaffRoleTier(userId: string, newRole: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_staff_role_tier", {
    p_user_id: userId,
    p_new_role: newRole,
  });

  if (error) {
    console.error("Error updating staff role:", error);
    return { error: error.message };
  }

  return { success: true };
}

export async function getOrgRoleConfig(orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_org_role_config", { p_org_id: orgId });
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function updateRoleDisplayName(orgId: string, role: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_role_display_name", {
    p_org_id: orgId, p_role: role, p_name: name,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function setRolePermissions(orgId: string, role: string, permissions: string[]) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_role_permissions", {
    p_org_id: orgId, p_role: role, p_permissions: permissions,
  });
  if (error) return { error: error.message };
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
