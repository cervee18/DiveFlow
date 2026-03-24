'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { localDateStr } from './dateUtils';

// Static map required — Tailwind purges dynamically-constructed class names
const COLOR_MAP: Record<string, { text: string; cardBg: string; cardBorder: string; cardHover: string }> = {
  teal:    { text: 'text-teal-700',    cardBg: 'bg-teal-50',    cardBorder: 'border-teal-200',    cardHover: 'hover:bg-teal-100'    },
  blue:    { text: 'text-blue-700',    cardBg: 'bg-blue-50',    cardBorder: 'border-blue-200',    cardHover: 'hover:bg-blue-100'    },
  purple:  { text: 'text-purple-700',  cardBg: 'bg-purple-50',  cardBorder: 'border-purple-200',  cardHover: 'hover:bg-purple-100'  },
  sky:     { text: 'text-sky-700',     cardBg: 'bg-sky-50',     cardBorder: 'border-sky-200',     cardHover: 'hover:bg-sky-100'     },
  indigo:  { text: 'text-indigo-700',  cardBg: 'bg-indigo-50',  cardBorder: 'border-indigo-200',  cardHover: 'hover:bg-indigo-100'  },
  amber:   { text: 'text-amber-700',   cardBg: 'bg-amber-50',   cardBorder: 'border-amber-200',   cardHover: 'hover:bg-amber-100'   },
  rose:    { text: 'text-rose-700',    cardBg: 'bg-rose-50',    cardBorder: 'border-rose-200',    cardHover: 'hover:bg-rose-100'    },
  emerald: { text: 'text-emerald-700', cardBg: 'bg-emerald-50', cardBorder: 'border-emerald-200', cardHover: 'hover:bg-emerald-100' },
  cyan:    { text: 'text-cyan-700',    cardBg: 'bg-cyan-50',    cardBorder: 'border-cyan-200',    cardHover: 'hover:bg-cyan-100'    },
  orange:  { text: 'text-orange-700',  cardBg: 'bg-orange-50',  cardBorder: 'border-orange-200',  cardHover: 'hover:bg-orange-100'  },
};

const FALLBACK = { text: 'text-teal-700', cardBg: 'bg-teal-50', cardBorder: 'border-teal-200', cardHover: 'hover:bg-teal-100' };

function getTypeAccent(color: string | undefined) {
  const mapped = COLOR_MAP[(color ?? '').toLowerCase()];
  return mapped ?? FALLBACK;
}

function BottomBar({ booked, capacity }: { booked: number; capacity: number | null }) {
  if (!capacity) return null;
  const pct   = Math.min((booked / capacity) * 100, 100);
  const color = pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-teal-400';
  return (
    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100">
      <div className={`h-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface OverviewTripCardProps {
  trip: any;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
  /** When provided, clicking a trip card calls this instead of navigating to /trips */
  onOpenTrip?: (tripId: string) => void;
}

export default function OverviewTripCard({
  trip,
  selectionMode = false,
  isSelected = false,
  onToggle,
  onOpenTrip,
}: OverviewTripCardProps) {
  const router = useRouter();
  const date   = localDateStr(trip.start_time);
  // Support both flat (RPC) and nested (legacy) shape
  const tripTypeColor    = trip.trip_type_color    ?? trip.trip_types?.color;
  const tripTypeCategory = trip.trip_type_category ?? trip.trip_types?.category;
  const tripTypeAbbr     = trip.trip_type_abbreviation ?? trip.trip_types?.abbreviation ?? trip.trip_types?.name ?? '';
  const vesselAbbr       = trip.vessel_abbreviation ?? trip.vessels?.abbreviation ?? trip.vessels?.name ?? '';

  const accent = getTypeAccent(tripTypeColor);

  // Pool and Class trips have no vessel — detect by category field
  const tripCategory = (tripTypeCategory ?? '').toLowerCase();
  const isNonWater   = tripCategory === 'pool' || tripCategory === 'class';

  // Left label: "TC 2T" for water trips, "Pool" / "Class" for non-water
  const leftLabel = isNonWater
    ? tripTypeAbbr
    : [vesselAbbr, tripTypeAbbr].filter(Boolean).join(' ') || '—';

  // Activity breakdown — supports both flat RPC shape and legacy trip_clients array
  const activityRows = useMemo(() => {
    // RPC path: activity_counts is a pre-aggregated JSON array
    if (Array.isArray(trip.activity_counts)) {
      return (trip.activity_counts as any[]).map((ac: any) => ({
        label: ac.abbreviation || ac.name,
        count: ac.count,
      }));
    }
    // Legacy path: iterate trip_clients
    const map: Record<string, { label: string; count: number }> = {};
    (trip.trip_clients ?? []).forEach((tc: any) => {
      if (!tc.activities) return;
      const key = tc.activities.name;
      if (!map[key]) map[key] = { label: tc.activities.abbreviation || tc.activities.name, count: 0 };
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
  }, [trip.activity_counts, trip.trip_clients]);

const handleClick = () => {
    if (selectionMode) {
      onToggle?.();
    } else if (onOpenTrip) {
      onOpenTrip(trip.id);
    } else {
      // Fallback: navigate to the Trips page (pre-sync localStorage so it
      // doesn't fall back to a stale date and overwrite the URL).
      localStorage.setItem('diveflow_date', date);
      router.push(`/trips?date=${date}&tripId=${trip.id}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`relative overflow-hidden w-full flex flex-col rounded-lg border text-left transition-all ${
        selectionMode
          ? isSelected
            ? 'bg-teal-50 border-teal-400 ring-1 ring-teal-300'
            : `${accent.cardBg} ${accent.cardBorder} hover:brightness-95`
          : `${accent.cardBg} ${accent.cardBorder} ${accent.cardHover} hover:shadow-sm`
      }`}
    >
      {/* Label strip — only rendered when the trip has a label */}
      {trip.label && (
        <div className="w-full px-2 pt-1.5 pb-1 border-b border-slate-100">
          <span className="text-[9px] font-medium text-slate-400 truncate block leading-none">
            {trip.label}
          </span>
        </div>
      )}

      {/* Main content row */}
      <div className="flex items-center gap-1 px-2 py-2.5 w-full">
        {/* Left label: "TC 2T" for water trips, "Pool" / "Class" for non-water */}
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide leading-none ${accent.text}`}>
          {leftLabel}
        </span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Available spaces */}
        {trip.max_divers != null && (
          <span className={`text-[9px] tabular-nums font-semibold shrink-0 ${
            trip.max_divers - trip.booked_divers <= 0
              ? 'text-red-500'
              : 'text-slate-400'
          }`}>
            {trip.max_divers - trip.booked_divers <= 0
              ? 'Full'
              : `(${trip.max_divers - trip.booked_divers})`}
          </span>
        )}

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
      </div>

      {/* Activity breakdown rows */}
      {activityRows.length > 0 && (
        <div className="w-full px-2 pb-2.5 flex flex-col gap-[3px]">
          {activityRows.map(({ label, count }) => (
            <div key={label} className="flex items-center justify-between gap-1">
              <span className={`text-[9px] truncate leading-none ${accent.text} opacity-80`}>{label}</span>
              <span className="text-[9px] font-bold tabular-nums text-slate-400 shrink-0">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Capacity bar pinned to bottom edge */}
      <BottomBar booked={trip.booked_divers} capacity={trip.max_divers} />
    </button>
  );
}
