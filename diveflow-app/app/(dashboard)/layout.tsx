import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar Navigation */}
      <aside className="w-50 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen">
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xl leading-none">D</span>
            </div>
            <span className="text-xl font-bold text-slate-700 tracking-tight">DiveFlow</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <Link href="/" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
            Dashboard
          </Link>
          <Link href="/clients" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
            Clients
          </Link>
          <Link href="/trips" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
            Trips
          </Link>
          <Link href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 cursor-not-allowed">
            Inventory (Soon)
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="text-xs font-medium text-slate-500 truncate px-2">
            {user.email}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-10 flex items-center px-8">
          <h2 className="text-sm font-medium text-slate-500">Dive Center Management</h2>
        </header>
        
        {/* This is where your page.tsx content gets injected */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}