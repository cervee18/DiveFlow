import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AlertsPanel from "@/app/(dashboard)/components/AlertsPanel";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          {/* Softened to slate-800 */}
          <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Overview of your daily operations.</p>
        </div>
        
        {/* Alerts panel */}
        <div className="mt-8">
          <AlertsPanel />
        </div>
      </main>
    </div>
  );
}