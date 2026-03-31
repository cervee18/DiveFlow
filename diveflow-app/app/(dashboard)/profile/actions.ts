"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function getGlobalProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const { data, error } = await supabase
    .from("profiles")
    .select("*, certification_levels(name, abbreviation)")
    .eq("id", user.id)
    .single();

  if (error) return { error: error.message };

  return { 
    profile: data,
    userAuth: user
  };
}

export async function updateGlobalProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  // Parse Form Data
  const first_name = formData.get("first_name") as string;
  const last_name = formData.get("last_name") as string;
  const phone = formData.get("phone") as string;
  const emergency_contact_name = formData.get("emergency_contact_name") as string;
  const emergency_contact_phone = formData.get("emergency_contact_phone") as string;
  
  const address_street = formData.get("address_street") as string || null;
  const address_city = formData.get("address_city") as string || null;
  const address_zip = formData.get("address_zip") as string || null;
  const address_country = formData.get("address_country") as string || null;
  
  const cert_organization = formData.get("cert_organization") as string || null;
  const cert_number = formData.get("cert_number") as string || null;
  const nitrox_cert_number = formData.get("nitrox_cert_number") as string || null;
  const cert_level = formData.get("cert_level") as string || null;
  const last_dive_date = formData.get("last_dive_date") as string || null;

  // 1. Update Auth Meta (First/Last name)
  if (first_name || last_name) {
    await supabase.auth.updateUser({
      data: { first_name, last_name }
    });
  }

  // 2. Update Global Profile Table
  const { error } = await supabase
    .from("profiles")
    .update({
      phone,
      emergency_contact_name,
      emergency_contact_phone,
      address_street,
      address_city,
      address_zip,
      address_country,
      cert_organization,
      cert_number,
      nitrox_cert_number,
      cert_level: cert_level || null,
      last_dive_date
    })
    .eq("id", user.id);

  if (error) {
    console.error("Profile update error:", error);
    return { error: error.message };
  }

  revalidatePath("/profile");
  return { success: true };
}

export async function getPublicReferences() {
  const supabase = await createClient();
  const { data: certOrgs } = await supabase.from("certification_organizations").select("*").order("name");
  const { data: certLevels } = await supabase.from("certification_levels").select("*").order("name");
  
  return {
     certOrgs: certOrgs || [],
     certLevels: certLevels || []
  };
}
