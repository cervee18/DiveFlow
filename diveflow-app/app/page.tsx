import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  // 1. Initialize the server-side Supabase client
  const supabase = await createClient();

  // 2. Fetch the currently authenticated user
  const { data: { user }, error } = await supabase.auth.getUser();

  // 3. If there is no user, redirect them to the login page immediately
  if (error || !user) {
    redirect("/login");
  }

  // 4. If the user is logged in, render the dashboard
  return (
    <div className="flex min-h-screen flex-col p-8 bg-zinc-50 dark:bg-black font-sans text-black dark:text-white">
      <main className="max-w-4xl mx-auto w-full mt-10">
        <h1 className="text-3xl font-bold mb-6">DiveFlow Dashboard</h1>
        
        <div className="p-6 bg-white dark:bg-zinc-900 rounded-lg shadow border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-xl font-semibold mb-2">Welcome Back!</h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-4">
            You are securely logged in as: <span className="font-medium text-black dark:text-white">{user.email}</span>
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Your dive center management portal is ready. We will start building out the modules here soon.
          </p>
        </div>
      </main>
    </div>
  );
}