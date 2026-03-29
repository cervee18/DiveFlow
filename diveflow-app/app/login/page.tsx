import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; mode?: string }>;
}) {
  const resolvedParams = await searchParams;
  const message = resolvedParams?.message;
  const isSignUp = resolvedParams?.mode === "signup";

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
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      return redirect("/login?mode=signup&message=Passwords do not match");
    }

    const supabase = await createClient();

    // Determine the origin safely for the email redirect URL
    const { headers } = await import("next/headers");
    const headerList = await headers();
    const origin = headerList.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const { error, data } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`
      }
    });

    if (error) {
      return redirect(`/login?mode=signup&message=${encodeURIComponent(error.message)}`);
    }
    
    // If the user needs to confirm their email
    if (data.session === null) {
      return redirect("/login?message=Check your email to confirm your account");
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
              type="email"
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

          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <input
                className="w-full px-4 py-2 border rounded-md bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                type="password"
                name="confirmPassword"
                placeholder="••••••••"
                required
              />
            </div>
          )}

          {message && (
            <p className="text-red-600 text-sm text-center bg-red-50 p-2 rounded border border-red-100">
              {message}
            </p>
          )}

          <div className="flex flex-col gap-3 mt-4">
            {isSignUp ? (
              <>
                <button
                  formAction={signUp}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-md transition-colors shadow-sm"
                >
                  Create Account
                </button>
                <p className="text-center text-sm text-slate-600 mt-2">
                  Already have an account?{" "}
                  <Link href="/login" className="text-teal-600 hover:underline font-medium">
                    Sign in
                  </Link>
                </p>
              </>
            ) : (
              <>
                <button
                  formAction={signIn}
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2 px-4 rounded-md transition-colors shadow-sm"
                >
                  Sign In
                </button>
                <p className="text-center text-sm text-slate-600 mt-2">
                  Don't have an account?{" "}
                  <Link href="/login?mode=signup" className="text-teal-600 hover:underline font-medium">
                    Sign up
                  </Link>
                </p>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}