import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import PickupListDocument, {
  type PickupListData,
  type PickupHotelGroup,
  type PickupSlot,
} from "./_components/PickupListDocument";
import PrintTrigger from "./PrintTrigger";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

// YYYY-MM-DD guard
function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function PickupListPage({ searchParams }: PageProps) {
  const { date } = await searchParams;

  if (!date || !isValidDate(date)) redirect("/overview");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Org info ────────────────────────────────────────────────────────────────
  const { data: profileData } = await supabase
    .from("profiles")
    .select("organizations(name, timezone)")
    .eq("id", user.id)
    .single();

  const orgRaw = (profileData as any)?.organizations;
  const orgName: string = orgRaw?.name ?? "Dive Center";
  const orgTimezone: string = orgRaw?.timezone ?? "UTC";

  // ── Trips for the day (with trip_clients) ───────────────────────────────────
  const { data: tripsRaw } = await supabase
    .from("trips")
    .select(`
      id,
      start_time,
      trip_types(name),
      trip_clients(
        client_id,
        pick_up,
        clients(first_name, last_name)
      )
    `)
    .gte("start_time", `${date}T00:00:00`)
    .lte("start_time", `${date}T23:59:59`)
    .order("start_time", { ascending: true });

  // Filter to trips that actually have pickup-requested clients
  const tripsWithPickups = (tripsRaw ?? [])
    .map((t: any) => ({
      ...t,
      pickupClients: (t.trip_clients ?? []).filter((tc: any) => tc.pick_up === true),
    }))
    .filter((t: any) => t.pickupClients.length > 0);

  // ── Hotel lookup for pickup clients ─────────────────────────────────────────
  const pickupClientIds = [
    ...new Set(tripsWithPickups.flatMap((t: any) => t.pickupClients.map((tc: any) => tc.client_id))),
  ] as string[];

  // Map: client_id → { hotel_name, room_number }
  const hotelMap: Record<string, { hotel_name: string | null; room_number: string | null }> = {};

  if (pickupClientIds.length > 0) {
    const { data: visitLinks } = await supabase
      .from("visit_clients")
      .select(`
        client_id,
        room_number,
        visits(
          start_date,
          end_date,
          hotels(name)
        )
      `)
      .in("client_id", pickupClientIds);

    for (const vl of visitLinks ?? []) {
      const v = (vl as any).visits;
      // Only use the visit that covers this date
      if (v && v.start_date <= date && v.end_date >= date) {
        hotelMap[(vl as any).client_id] = {
          hotel_name: v.hotels?.name ?? null,
          room_number: (vl as any).room_number ?? null,
        };
      }
    }
  }

  // ── Build slots ─────────────────────────────────────────────────────────────
  const slots: PickupSlot[] = tripsWithPickups.map((trip: any) => {
    // Group pickup clients by hotel
    const byHotel: Record<string, PickupHotelGroup> = {};

    for (const tc of trip.pickupClients) {
      const info = hotelMap[tc.client_id];
      const key = info?.hotel_name ?? "__none__";

      if (!byHotel[key]) {
        byHotel[key] = {
          hotel_name: info?.hotel_name ?? null,
          clients: [],
        };
      }

      byHotel[key].clients.push({
        name: `${tc.clients.first_name} ${tc.clients.last_name}`,
        room_number: info?.room_number ?? null,
      });
    }

    // Sort groups: known hotels A→Z, "No Hotel" last
    const groups = Object.values(byHotel).sort((a, b) => {
      if (a.hotel_name === null) return 1;
      if (b.hotel_name === null) return -1;
      return a.hotel_name.localeCompare(b.hotel_name);
    });

    return {
      start_time: trip.start_time,
      trip_type_name: trip.trip_types?.name ?? null,
      groups,
    };
  });

  // ── Assemble ─────────────────────────────────────────────────────────────────
  const data: PickupListData = {
    org: { name: orgName, timezone: orgTimezone },
    date,
    slots,
    generatedAt: new Date().toISOString(),
  };

  return (
    <>
      <PrintTrigger />
      <PickupListDocument data={data} />
    </>
  );
}
