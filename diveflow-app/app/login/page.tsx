import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { message: string };
}) {

  const signIn = async (formData: FormData) => {
    "use server";
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return redirect("/login?message=Invalid login credentials");
    }
    return redirect("/");
  };

  const signUp = async (formData: FormData) => {
    "use server";
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = await createClient();

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      return redirect("/login?message=Could not sign up user");
    }
    return redirect("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-center mb-6 text-teal-500">
          DiveFlow
        </h1>
        
        <form className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="email">
              Email
            </label>
            <input
              className="w-full px-4 py-2 border rounded-md bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              name="email"
              placeholder="instructor@divecenter.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="password">
              Password
            </label>
            <input
              className="w-full px-4 py-2 border rounded-md bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              type="password"
              name="password"
              placeholder="••••••••"
              required
            />
          </div>

          {searchParams?.message && (
            <p className="text-red-600 text-sm text-center bg-red-50 p-2 rounded border border-red-100">
              {searchParams.message}
            </p>
          )}

          <div className="flex flex-col gap-3 mt-4">
            <button
              formAction={signIn}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-md transition-colors shadow-sm"
            >
              Sign In
            </button>
            <button
              formAction={signUp}
              className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium py-2 px-4 rounded-md transition-colors border border-slate-200"
            >
              Sign Up
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}