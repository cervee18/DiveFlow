import { createClient } from "@/utils/supabase/server";
import { NextRequest } from "next/server";
import { fetchSummaryData, buildSummaryHtml } from "@/lib/documents/summary";

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) return Response.json({ error: "Missing clientId" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  if (!profile) return Response.json({ error: "Profile not found" }, { status: 401 });

  const result = await fetchSummaryData(clientId, supabase);

  if (!result.ok) {
    if (result.error === 'not_found') return Response.json({ error: "Client not found" }, { status: 404 });
    return Response.json({ error: "missing_logs", trips: result.trips }, { status: 422 });
  }

  const html = buildSummaryHtml(result.data).replace('</body>', '<script>setTimeout(() => window.print(), 300);</script></body>');

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
