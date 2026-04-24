import { redirect }    from "next/navigation";
import { headers }     from "next/headers";
import { getAuthContext, isStaff, isAdmin } from "@/utils/auth";
import { createClient } from "@/utils/supabase/server";
import MobileNav        from "@/app/(dashboard)/components/MobileNav";
import SidebarNav       from "@/app/(dashboard)/components/SidebarNav";
import SubNavBar        from "@/app/(dashboard)/components/SubNavBar";
import { OrgSettingsProvider, type OrgSettings } from "@/app/(dashboard)/components/OrgSettingsContext";
import { PermissionsProvider } from "@/app/(dashboard)/components/PermissionsContext";
import { getOpenSession } from "@/utils/pos-session";
import { ALL_PERMISSIONS, PAGE_PERMISSION_MAP } from "@/lib/permissions";

// Paths that require at least staff-level role (no per-org permission needed)
const STAFF_ONLY_PATHS = ['/clients', '/trips'];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role } = await getAuthContext();

  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '/';

  // Admin: full access, no permission check needed
  const admin = isAdmin(role);
  const staff = isStaff(role);

  // Clients can only access paths not in STAFF_ONLY_PATHS or PAGE_PERMISSION_MAP
  const isStaffOnlyPath = STAFF_ONLY_PATHS.some(p => pathname.startsWith(p));
  if (!staff && isStaffOnlyPath) redirect('/');

  // Fetch org data
  const supabase = await createClient();
  const { data: profileData } = await supabase
    .from('profiles')
    .select('organization_id, organizations ( unit_system, currency )')
    .eq('id', user.id)
    .single();

  const org = (profileData?.organizations as any) ?? {};
  const orgSettings: OrgSettings = {
    unitSystem: (org.unit_system ?? 'metric') as 'metric' | 'imperial',
    currency:   org.currency ?? 'EUR',
  };
  const orgId = profileData?.organization_id as string | undefined;

  // Resolve granted permissions for this session
  let grantedPermissions: string[] = [];
  if (admin) {
    grantedPermissions = ['*']; // wildcard — usePermission always returns true
  } else if (staff && orgId) {
    const { data: rows } = await supabase
      .from('org_role_permissions')
      .select('permission')
      .eq('organization_id', orgId)
      .eq('role', role);
    grantedPermissions = (rows ?? []).map(r => r.permission);
  }

  // Gate permission-managed pages for non-admin staff
  if (!admin && staff) {
    const requiredPermission = Object.entries(PAGE_PERMISSION_MAP).find(
      ([path]) => pathname.startsWith(path)
    )?.[1];
    if (requiredPermission && !grantedPermissions.includes(requiredPermission)) {
      redirect('/');
    }
  }

  // Clients are blocked from all permission-managed pages
  if (!staff) {
    const isPermissionGatedPath = Object.keys(PAGE_PERMISSION_MAP).some(p => pathname.startsWith(p));
    if (isPermissionGatedPath) redirect('/');
  }

  const openSession = orgId ? await getOpenSession(orgId, supabase) : null;
  const isPOSOpen = !!openSession;

  return (
    <OrgSettingsProvider settings={orgSettings}>
      <PermissionsProvider permissions={grantedPermissions}>
        <div className="min-h-screen flex bg-slate-50">
          <SidebarNav
            isStaff={staff}
            isAdmin={admin}
            userEmail={user.email ?? ''}
            isPOSOpen={isPOSOpen}
          />

          <div className="flex-1 flex flex-col min-w-0">
            <SubNavBar isPOSOpen={isPOSOpen} />
            <main className="flex-1 pb-16 md:pb-0">
              {children}
            </main>
          </div>

          <MobileNav isStaff={staff} />
        </div>
      </PermissionsProvider>
    </OrgSettingsProvider>
  );
}
