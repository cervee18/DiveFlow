'use client';

import { useRouter } from 'next/navigation';
import { formatTime } from './dateUtils';

function FillBar({ booked, capacity }: { booked: number; capacity: number | null }) {
  if (!capacity) return null;
  const pct       = Math.min((booked / capacity) * 100, 100);
  const available = Math.max(capacity - booked, 0);
  const barColor  = pct >= 90 ? 'bg-red-500'   : pct >= 70 ? 'bg-amber-400'  : 'bg-teal-500';
  const textColor = pct >= 90 ? 'text-red-600'  : pct >= 70 ? 'text-amber-600' : 'text-teal-600';
  return (
    <div className="mt-3">
      <div className="flex justify-between items-center text-[10px] font-semibold mb-1">
        <span className="text-slate-400">{booked} / {capacity}</span>
        <span className={textColor}>{available === 0 ? 'Full' : `${available} left`}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface StaffTripCardProps {
  trip: any;
  selectedDate: string;
}

export default function StaffTripCard({ trip, selectedDate }: StaffTripCardProps) {
  const router = useRouter();

  // Derive staff initials from trip_staff → staff
  const staffMembers: { initials: string; id: string }[] = (trip.trip_staff ?? [])
    .map((ts: any) => {
      if (!ts.staff) return null;
      const initials =
        ts.staff.initials ||
        `${ts.staff.first_name?.[0] ?? ''}${ts.staff.last_name?.[0] ?? ''}`.toUpperCase();
      return { initials, id: ts.staff.id ?? ts.staff_id };
    })
    .filter(Boolean);

  return (
    <button
      onClick={() => router.push(`/trips?date=${selectedDate}&tripId=${trip.id}`)}
      className="w-full text-left rounded-xl p-3 shadow-sm border bg-white border-slate-200 hover:shadow-md hover:border-teal-300 transition-all"
    >
      {/* Type · Vessel  +  staff chips on the right */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {trip.trip_types?.name && (
            <span className="text-base font-bold text-slate-800 leading-none">
              {trip.trip_types.name}
            </span>
          )}
          {trip.trip_types?.name && (trip.vessels?.abbreviation || trip.vessels?.name) && (
            <span className="text-slate-300 text-base leading-none">·</span>
          )}
          {(trip.vessels?.abbreviation || trip.vessels?.name) && (
            <span className="text-base font-bold text-slate-800 leading-none">
              {trip.vessels.abbreviation || trip.vessels.name}
            </span>
          )}
        </div>

        {/* Staff chips */}
        <div className="flex flex-wrap justify-end gap-1 shrink-0">
          {staffMembers.length === 0 ? (
            <span className="text-[11px] text-slate-300 italic leading-none mt-0.5">—</span>
          ) : (
            staffMembers.map((s, i) => (
              <span
                key={s.id ?? i}
                title={s.initials}
                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold leading-none"
              >
                {s.initials}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Label + Time */}
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold text-slate-500 leading-snug line-clamp-2 min-w-0">
          {trip.label || '—'}
        </p>
        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
          {formatTime(trip.start_time)}
        </span>
      </div>

      {/* Fill bar */}
      <FillBar booked={trip.booked_divers} capacity={trip.max_divers} />
    </button>
  );
}
