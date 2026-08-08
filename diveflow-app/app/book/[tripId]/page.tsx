import { createServiceClient } from '@/utils/supabase/service';
import { notFound } from 'next/navigation';
import BookingForm from './BookingForm';

export default async function BookTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const supabase = createServiceClient();

  const [{ data: trip, error }, { data: available }] = await Promise.all([
    supabase
      .from('trips')
      .select('id, start_time, duration_minutes, max_divers, trip_types(name, online_bookable, online_price_per_person), divesites(name)')
      .eq('id', tripId)
      .single(),
    supabase.rpc('get_trip_available_spaces', { p_trip_id: tripId }),
  ]);

  if (error || !trip) notFound();

  const tt = trip.trip_types as any;
  if (!tt?.online_bookable) notFound();

  return (
    <BookingForm
      trip={{
        trip_id:          trip.id,
        start_time:       trip.start_time,
        duration_minutes: trip.duration_minutes,
        trip_type:        tt?.name ?? null,
        dive_site:        (trip.divesites as any)?.name ?? null,
        max_divers:       trip.max_divers,
        available_spaces: available ?? 0,
        price_per_person: tt?.online_price_per_person ?? null,
      }}
    />
  );
}
