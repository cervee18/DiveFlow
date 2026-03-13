import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xl leading-none">D</span>
            </div>
            {/* Softened to slate-700 */}
            <span className="text-xl font-bold text-slate-700 tracking-tight">DiveFlow</span>
          </div>
          <div className="text-sm font-medium text-slate-500 py-1.5 px-4 bg-slate-50 border border-slate-200 rounded-full">
            {user.email}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          {/* Softened to slate-800 */}
          <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Overview of your daily operations.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Today's Boat Trips</h2>
            <div className="flex items-end justify-between">
              {/* Softened to slate-700 */}
              <p className="text-3xl font-bold text-slate-700">3</p>
              <span className="text-sm font-medium text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-md">Scheduled</span>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Divers on Roster</h2>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold text-slate-700">24</p>
              <span className="text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md">All checked in</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Equipment Alerts</h2>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold text-amber-500">2</p>
              <span className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 rounded-md">Service due</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}