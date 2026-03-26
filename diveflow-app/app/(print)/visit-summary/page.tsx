import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import VisitSummaryDocument, { type VisitSummaryData } from "./_components/VisitSummaryDocument";
import PrintTrigger from "./PrintTrigger";

interface PageProps {
  searchParams: Promise<{ clientId?: string; visitId?: string }>;
}

export default async function VisitSummaryPage({ searchParams }: PageProps) {
  const { clientId, visitId } = await searchParams;

  if (!clientId || !visitId) {
    redirect("/clients");
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch all data in parallel
  const [profileRes, clientRes, visitLinkRes, tripsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("organizations(name, email, phone, timezone, unit_system)")
      .eq("id", user.id)
      .single(),

    supabase
      .from("clients")
      .select("first_name, last_name, cert_number, certification_levels(abbreviation)")
      .eq("id", clientId)
      .single(),

    supabase
      .from("visit_clients")
      .select("room_number, visits!inner(id, start_date, end_date, hotels(name))")
      .eq("visit_id", visitId)
      .eq("client_id", clientId)
      .single(),

    // Trips are fetched after we have the visit dates — done below
    Promise.resolve(null),
  ]);

  if (!clientRes.data || !visitLinkRes.data) {
    redirect("/clients");
  }

  const visit = (visitLinkRes.data as any).visits;

  // Now fetch trips using the visit date range
  const { data: tripsData } = await supabase
    .from("trips")
    .select(`
      id, start_time,
      trip_types(name, number_of_dives),
      vessels(name),
      divesites(name),
      trip_clients!inner(
        id,
        client_id,
        client_dive_logs(
          max_depth,
          bottom_time,
          trip_dives(
            dive_number,
            started_at,
            divesites(name)
          )
        )
      )
    `)
    .eq("trip_clients.client_id", clientId)
    .gte("start_time", `${visit.start_date}T00:00:00`)
    .lte("start_time", `${visit.end_date}T23:59:59`)
    .order("start_time", { ascending: true });

  const orgRaw = (profileRes.data as any)?.organizations;
  const clientRaw = clientRes.data as any;
  const visitLinkRaw = visitLinkRes.data as any;

  const summaryData: VisitSummaryData = {
    org: {
      name: orgRaw?.name ?? "Dive Center",
      email: orgRaw?.email ?? null,
      phone: orgRaw?.phone ?? null,
      timezone: orgRaw?.timezone ?? "UTC",
      unit_system: orgRaw?.unit_system ?? "metric",
    },
    client: {
      first_name: clientRaw.first_name,
      last_name: clientRaw.last_name,
      cert_level_abbr: clientRaw.certification_levels?.abbreviation ?? null,
      cert_number: clientRaw.cert_number ?? null,
    },
    visit: {
      start_date: visit.start_date,
      end_date: visit.end_date,
      hotel_name: visit.hotels?.name ?? null,
      room_number: visitLinkRaw.room_number ?? null,
    },
    trips: (tripsData ?? []).map((t: any) => {
      const tripClient = Array.isArray(t.trip_clients) ? t.trip_clients[0] : t.trip_clients;
      const rawLogs: any[] = tripClient?.client_dive_logs ?? [];

      const diveLogs = rawLogs
        .filter((log: any) => log.trip_dives)
        .sort((a: any, b: any) => (a.trip_dives.dive_number ?? 0) - (b.trip_dives.dive_number ?? 0))
        .map((log: any) => ({
          dive_number: log.trip_dives.dive_number ?? null,
          started_at: log.trip_dives.started_at ?? null,
          divesite_name: log.trip_dives.divesites?.name ?? null,
          max_depth: log.max_depth != null ? Number(log.max_depth) : null,
          bottom_time: log.bottom_time ?? null,
        }));

      return {
        id: t.id,
        start_time: t.start_time,
        trip_type_name: t.trip_types?.name ?? null,
        vessel_name: t.vessels?.name ?? null,
        divesite_name: t.divesites?.name ?? null,
        number_of_dives: t.trip_types?.number_of_dives ?? null,
        dive_logs: diveLogs,
      };
    }),
    generatedAt: new Date().toISOString(),
  };

  return (
    <>
      <PrintTrigger />
      <VisitSummaryDocument data={summaryData} />
    </>
  );
}
