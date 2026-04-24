import { createServiceClient } from '@/utils/supabase/service';
import { NextRequest } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await params;
  const supabase = createServiceClient();

  const [tripResult, spacesResult] = await Promise.all([
    supabase
      .from('trips')
      .select('id, start_time, duration_minutes, max_divers, trip_types(name, online_bookable, online_price_per_person), divesites(name)')
      .eq('id', tripId)
      .single(),
    supabase.rpc('get_trip_available_spaces', { p_trip_id: tripId }),
  ]);

  if (tripResult.error || !tripResult.data) {
    return Response.json({ error: 'Trip not found' }, { status: 404 });
  }

  const trip = tripResult.data as any;

  if (!trip.trip_types?.online_bookable) {
    return Response.json({ error: 'Trip not available for online booking' }, { status: 403 });
  }

  return Response.json({
    trip_id:          trip.id,
    start_time:       trip.start_time,
    duration_minutes: trip.duration_minutes,
    trip_type:        trip.trip_types?.name ?? null,
    dive_site:        (trip.divesites as any)?.name ?? null,
    max_divers:       trip.max_divers,
    available_spaces: spacesResult.data ?? 0,
    price_per_person: (trip.trip_types as any)?.online_price_per_person ?? null,
  });
}
