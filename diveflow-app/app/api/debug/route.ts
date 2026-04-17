import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''; // anon key might not have access to pg_proc
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const supabase = createClient(supabaseUrl, supabaseService);

  // We can query pg_proc but maybe access is restricted for anon.
  // How else can we see the definition? Just ask the user!
  // Wait, I can try!
  const { data: funcObj, error: funcErr } = await supabase.rpc("search_global_identities", { p_query: "" });

  return NextResponse.json({
    result: funcObj,
    err: funcErr
  });
}
