'use client';

import { useRouter } from 'next/navigation';
import { localDateStr } from './dateUtils';

function getTypeAccent(typeName: string | undefined) {
  const name = (typeName ?? '').toLowerCase();
  if (name.includes('night'))   return { bar: 'bg-indigo-400', text: 'text-indigo-600', abbr: 'Night' };
  if (name.includes('snorkel')) return { bar: 'bg-sky-400',    text: 'text-sky-600',    abbr: 'Snkl'  };
  if (name.includes('pm'))      return { bar: 'bg-amber-400',  text: 'text-amber-600',  abbr: 'PM'    };
  return                               { bar: 'bg-teal-400',   text: 'text-teal-600',   abbr: 'AM'    };
}

function MiniBar({ booked, capacity }: { booked: number; capacity: number | null }) {
  if (!capacity) return null;
  const pct       = Math.min((booked / capacity) * 100, 100);
  const available = Math.max(capacity - booked, 0);
  const color     = pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-teal-400';
  return (
    <div className="flex items-center gap-1 shrink-0">
      <div className="w-10 h-1 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[9px] tabular-nums font-semibold w-6 text-right ${
        available === 0 ? 'text-red-500' : 'text-slate-400'
      }`}>
        {available === 0 ? 'Full' : `${available}`}
      </span>
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
  const accent = getTypeAccent(trip.trip_types?.name);
  const vessel = trip.vessels?.abbreviation || trip.vessels?.name || '—';

  const handleClick = () => {
    if (selectionMode) onToggle?.();
    else router.push(`/trips?date=${date}&tripId=${trip.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-1.5 px-2 py-2.5 rounded-lg border text-left transition-all ${
        selectionMode
          ? isSelected
            ? 'bg-teal-50 border-teal-400 ring-1 ring-teal-300'
            : 'bg-white border-slate-200 hover:border-teal-200 hover:bg-teal-50/30'
          : 'bg-white border-slate-200 hover:shadow-sm hover:border-slate-300'
      }`}
    >
      {/* Type colour accent */}
      <span className={`shrink-0 w-1 h-6 rounded-full ${accent.bar}`} />

      {/* Type abbreviation */}
      <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wide ${accent.text} w-7`}>
        {accent.abbr}
      </span>

      {/* Vessel */}
      <span className="text-[11px] font-semibold text-slate-700 shrink-0 flex-1">
        {vessel}
      </span>

      {/* Mini fill bar */}
      <MiniBar booked={trip.booked_divers} capacity={trip.max_divers} />

      {/* Selection checkbox */}
      {selectionMode && (
        <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          isSelected ? 'bg-teal-500 border-teal-500' : 'border-slate-300'
        }`}>
          {isSelected && (
            <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
      )}
    </button>
  );
}
