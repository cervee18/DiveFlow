import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type UserRole = 'client' | 'staff_1' | 'staff_2' | 'admin';

export const STAFF_ROLES: UserRole[] = ['staff_1', 'staff_2', 'admin'];

export async function getAuthContext(): Promise<{ user: { id: string; email?: string }; role: UserRole }> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return {
    user,
    role: (profile?.role ?? 'client') as UserRole,
  };
}

export function isStaff(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}
