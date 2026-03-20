'use client';

import { useRouter } from 'next/navigation';
import { localDateStr, formatTime } from './dateUtils';

function FillBar({ booked, capacity }: { booked: number; capacity: number | null }) {
  if (!capacity) return null;
  const pct       = Math.min((booked / capacity) * 100, 100);
  const available = Math.max(capacity - booked, 0);
  const barColor  = pct >= 90 ? 'bg-red-500'    : pct >= 70 ? 'bg-amber-400'   : 'bg-teal-500';
  const textColor = pct >= 90 ? 'text-red-600'   : pct >= 70 ? 'text-amber-600' : 'text-teal-600';
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

interface OverviewTripCardProps {
  trip: any;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}

export default function OverviewTripCard({
  trip,
  selectionMode = false,
  isSelected = false,
  onToggle,
}: OverviewTripCardProps) {
  const router = useRouter();
  const date   = localDateStr(trip.start_time);

  const handleClick = () => {
    if (selectionMode) {
      onToggle?.();
    } else {
      router.push(`/trips?date=${date}&tripId=${trip.id}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left rounded-xl p-3 shadow-sm transition-all border ${
        selectionMode
          ? isSelected
            ? 'bg-teal-50 border-teal-400 ring-2 ring-teal-300 shadow-md'
            : 'bg-white border-slate-200 hover:border-teal-200 hover:bg-teal-50/40'
          : 'bg-white border-slate-200 hover:shadow-md hover:border-teal-300'
      }`}
    >
      {/* Type · vessel (top, styled like time was) */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {trip.trip_types?.name && (
            <span className="text-base font-bold text-slate-800 leading-none">{trip.trip_types.name}</span>
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
        {selectionMode && (
          <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
            isSelected ? 'bg-teal-500 border-teal-500' : 'border-slate-300'
          }`}>
            {isSelected && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
        )}
      </div>

      {/* Label + Time */}
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold text-slate-500 leading-snug line-clamp-2 min-w-0">
          {trip.label || '—'}
        </p>
        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{formatTime(trip.start_time)}</span>
      </div>

      <FillBar booked={trip.booked_divers} capacity={trip.max_divers} />
    </button>
  );
}
