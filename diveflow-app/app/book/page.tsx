import { createServiceClient } from '@/utils/supabase/service';
import Link from 'next/link';
import DatePicker from './DatePicker';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function toLocalDateString(date: Date) {
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: rawDate } = await searchParams;

  const today = toLocalDateString(new Date());
  const selectedDate = rawDate ?? today;

  const dayStart = `${selectedDate}T00:00:00`;
  const dayEnd   = `${selectedDate}T23:59:59`;

  const supabase = createServiceClient();

  const { data: trips } = await supabase
    .from('trips')
    .select(`
      id, start_time, duration_minutes, max_divers, label,
      trip_types!inner ( name, online_bookable ),
      divesites ( name )
    `)
    .eq('trip_types.online_bookable', true)
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd)
    .order('start_time');

  const withSpaces = await Promise.all(
    (trips ?? []).map(async (trip) => {
      const { data } = await supabase.rpc('get_trip_available_spaces', { p_trip_id: trip.id });
      return { ...trip, available: data ?? 0 };
    })
  );

  const available = withSpaces.filter(t => t.available > 0);

  const displayDate = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Available Trips</h1>
          <p className="text-sm text-slate-500 mt-1">{displayDate}</p>
        </div>
        <DatePicker value={selectedDate} />
      </div>

      {available.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 px-6 py-12 text-center">
          <p className="text-slate-400 text-sm">No trips available for booking on this day.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {available.map(trip => {
            const tt = trip.trip_types as any;
            const site = trip.divesites as any;
            return (
              <Link
                key={trip.id}
                href={`/book/${trip.id}`}
                className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-teal-400 hover:shadow-sm transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">
                    {trip.label ?? tt?.name}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {formatTime(trip.start_time)}
                    {site?.name && <> · {site.name}</>}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className={`text-sm font-semibold ${trip.available <= 3 ? 'text-amber-600' : 'text-teal-600'}`}>
                    {trip.available}
                  </span>
                  <div className="text-[11px] text-slate-400">
                    {trip.available === 1 ? 'spot left' : 'spots left'}
                  </div>
                </div>

                <svg className="w-4 h-4 text-slate-300 group-hover:text-teal-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
