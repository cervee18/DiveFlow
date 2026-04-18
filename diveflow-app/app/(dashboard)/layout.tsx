import { redirect }    from "next/navigation";
import { headers }     from "next/headers";
import { getAuthContext, isStaff, isAdmin } from "@/utils/auth";
import { createClient } from "@/utils/supabase/server";
import MobileNav        from "@/app/(dashboard)/components/MobileNav";
import SidebarNav       from "@/app/(dashboard)/components/SidebarNav";
import { OrgSettingsProvider, type OrgSettings } from "@/app/(dashboard)/components/OrgSettingsContext";
import { getOpenSession } from "@/utils/pos-session";

// Routes that require staff-level access (non-clients)
const STAFF_ONLY_PATHS = ['/overview', '/clients', '/trips', '/staff'];

// Routes that require admin-level access only
const ADMIN_ONLY_PATHS = ['/logs', '/statistics', '/inventory', '/management', '/pos'];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role } = await getAuthContext();

  // Protect staff-only routes from client-role users
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '/';
  const isStaffOnlyPath = STAFF_ONLY_PATHS.some(p => pathname.startsWith(p));

  if (!isStaff(role) && isStaffOnlyPath) redirect('/');

  const isAdminOnlyPath = ADMIN_ONLY_PATHS.some(p => pathname.startsWith(p));
  if (!isAdmin(role) && isAdminOnlyPath) redirect('/');

  // Fetch org settings (unit system, currency) for the context provider
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
  const openSession = orgId ? await getOpenSession(orgId, supabase) : null;
  const isPOSOpen = !!openSession;

  return (
    <OrgSettingsProvider settings={orgSettings}>
      <div className="min-h-screen flex bg-slate-50">
        <SidebarNav
          isStaff={isStaff(role)}
          isAdmin={isAdmin(role)}
          userEmail={user.email ?? ''}
          isPOSOpen={isPOSOpen}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 pb-16 md:pb-0">
            {children}
          </main>
        </div>

        {/* Mobile bottom tab bar */}
        <MobileNav isStaff={isStaff(role)} />
      </div>
    </OrgSettingsProvider>
  );
}
