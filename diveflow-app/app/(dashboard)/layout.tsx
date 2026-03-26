import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getAuthContext, isStaff, isAdmin } from "@/utils/auth";

// Routes that require staff-level access (non-clients)
const STAFF_ONLY_PATHS = ['/overview', '/clients', '/trips', '/staff'];

// Routes that require admin-level access only
const ADMIN_ONLY_PATHS = ['/logs', '/statistics'];

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

  if (!isStaff(role) && isStaffOnlyPath) {
    redirect('/');
  }

  const isAdminOnlyPath = ADMIN_ONLY_PATHS.some(p => pathname.startsWith(p));
  if (!isAdmin(role) && isAdminOnlyPath) {
    redirect('/');
  }

  const signOut = async () => {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar Navigation */}
      <aside className="w-50 bg-slate-900 border-r border-slate-700/50 flex flex-col sticky top-0 h-screen">
        <div className="h-16 flex items-center px-6 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-500 rounded-md flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xl leading-none">D</span>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">DiveFlow</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-teal-400 transition-colors">
            Dashboard
          </Link>

          {isStaff(role) && (
            <>
              <Link href="/overview" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-teal-400 transition-colors">
                Overview
              </Link>
              <Link href="/clients" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-teal-400 transition-colors">
                Clients
              </Link>
              <Link href="/staff" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-teal-400 transition-colors">
                Staff
              </Link>
            </>
          )}

          {isAdmin(role) && (
            <>
              <div className="my-2 border-t border-slate-700/50" />
              <Link href="/logs" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-teal-400 transition-colors">
                Logs
              </Link>
              <Link href="/statistics" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-teal-400 transition-colors">
                Statistics
              </Link>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-700/50 flex flex-col gap-2">
          <div className="text-xs font-medium text-slate-400 truncate px-2">
            {user.email}
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
