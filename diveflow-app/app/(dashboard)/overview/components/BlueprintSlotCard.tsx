'use client';

// Grayed-out placeholder card for an unconfirmed weekly schedule slot.
// Clicking the card body opens TripFormModal pre-filled for edit-to-confirm.
// The checkmark button quick-confirms without opening the modal.

export interface BlueprintSlot {
  id: string;
  vessel_id: string;
  vessel_abbreviation: string | null;
  trip_type_id: string;
  trip_type_abbreviation: string | null;
  trip_type_color: string | null;
  trip_type_category: string | null;
  trip_type_capacity: number;
  start_time: string; // "HH:MM:SS"
}

// Mirrors the COLOR_MAP keys in OverviewTripCard — grayed-out border variant
const BORDER_MAP: Record<string, string> = {
  teal:    'border-teal-100',
  blue:    'border-blue-100',
  purple:  'border-purple-100',
  sky:     'border-sky-100',
  indigo:  'border-indigo-100',
  amber:   'border-amber-100',
  rose:    'border-rose-100',
  emerald: 'border-emerald-100',
  cyan:    'border-cyan-100',
  orange:  'border-orange-100',
};

interface Props {
  slot: BlueprintSlot;
  isConfirming: boolean;
  onConfirm: () => void;
  onEdit: () => void;
}

export default function BlueprintSlotCard({ slot, isConfirming, onConfirm, onEdit }: Props) {
  const color      = slot.trip_type_color ?? 'blue';
  const borderCls  = BORDER_MAP[color] ?? 'border-slate-100';

  const category = (slot.trip_type_category ?? '').toLowerCase();
  const isNonWater = category === 'pool' || category === 'class';

  const leftLabel = isNonWater
    ? (slot.trip_type_abbreviation ?? '')
    : [slot.vessel_abbreviation, slot.trip_type_abbreviation].filter(Boolean).join(' ') || '—';

  return (
    <div className={`group relative w-full flex flex-col rounded-lg border border-dashed ${borderCls} bg-white overflow-hidden`}>
      {/* Clickable body — opens pre-filled TripFormModal */}
      <button
        onClick={onEdit}
        className="flex items-center gap-1 px-2 py-2.5 w-full text-left"
      >
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide leading-none text-slate-300">
          {leftLabel}
        </span>
        <span className="flex-1" />
        <span className="text-[9px] tabular-nums font-semibold text-slate-200 shrink-0">
          ({slot.trip_type_capacity})
        </span>
      </button>

      {/* Confirm button — always accessible, visible on hover */}
      <button
        onClick={e => { e.stopPropagation(); onConfirm(); }}
        disabled={isConfirming}
        title="Confirm trip"
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded bg-teal-500 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConfirming ? (
          <svg className="w-3 h-3 animate-spin text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
    </div>
  );
}
