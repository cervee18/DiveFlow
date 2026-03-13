import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message: string };
}) {
  // --- SERVER ACTIONS ---
  // These functions run securely on the server, never in the browser.

  const signIn = async (formData: FormData) => {
    "use server";
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return redirect("/login?message=Invalid login credentials");
    }

    // If successful, redirect to the dashboard we just created
    return redirect("/");
  };

  const signUp = async (formData: FormData) => {
    "use server";
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = await createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return redirect("/login?message=Could not sign up user");
    }

    return redirect("/");
  };

  // --- UI RENDER ---
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black p-4">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 p-8 rounded-lg shadow-md border border-zinc-200 dark:border-zinc-800">
        <h1 className="text-2xl font-bold text-center mb-6 text-blue-600 dark:text-blue-400">
          DiveFlow
        </h1>
        
        <form className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="email">
              Email
            </label>
            <input
              className="w-full px-4 py-2 border rounded-md bg-zinc-50 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              name="email"
              placeholder="instructor@divecenter.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1" htmlFor="password">
              Password
            </label>
            <input
              className="w-full px-4 py-2 border rounded-md bg-zinc-50 dark:bg-zinc-950 border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              type="password"
              name="password"
              placeholder="••••••••"
              required
            />
          </div>

          {/* Show error messages if they exist in the URL */}
          {searchParams?.message && (
            <p className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-950/30 p-2 rounded">
              {searchParams.message}
            </p>
          )}

          <div className="flex flex-col gap-2 mt-4">
            <button
              formAction={signIn}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Sign In
            </button>
            <button
              formAction={signUp}
              className="w-full bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-black dark:text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Sign Up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}