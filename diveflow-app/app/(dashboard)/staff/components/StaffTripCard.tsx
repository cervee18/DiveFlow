'use client';

import { useRouter } from 'next/navigation';

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function FillBar({ booked, capacity, startTime }: { booked: number; capacity: number | null; startTime: string }) {
  if (!capacity) return null;
  const pct       = Math.min((booked / capacity) * 100, 100);
  const available = Math.max(capacity - booked, 0);
  const barColor  = pct >= 90 ? 'bg-red-500'   : pct >= 70 ? 'bg-amber-400'  : 'bg-teal-500';
  const textColor = pct >= 90 ? 'text-red-600'  : pct >= 70 ? 'text-amber-600' : 'text-teal-600';
  return (
    <div className="mt-2">
      <div className="flex justify-between items-center text-[10px] font-semibold mb-1">
        <span className="text-slate-400 tabular-nums">{formatTime(startTime)}</span>
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
  assignMode?: boolean;
  selectedStaffIds?: string[];
  onAssign?: () => void;
  onRemoveStaff?: (staffId: string) => void;
}

export default function StaffTripCard({
  trip,
  selectedDate,
  assignMode = false,
  selectedStaffIds = [],
  onAssign,
  onRemoveStaff,
}: StaffTripCardProps) {
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

  // In assign mode: staff chips already-on-trip that are also selected show as "will remove"
  const assignedStaffIds = new Set(staffMembers.map(s => s.id));
  const willAdd    = selectedStaffIds.filter(id => !assignedStaffIds.has(id));
  const willRemove = selectedStaffIds.filter(id =>  assignedStaffIds.has(id));

  const handleClick = () => {
    if (assignMode) {
      onAssign?.();
    } else {
      router.push(`/trips?date=${selectedDate}&tripId=${trip.id}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left rounded-xl p-3 shadow-sm border transition-all ${
        assignMode
          ? 'bg-white border-slate-200 hover:border-teal-400 hover:ring-2 hover:ring-teal-100 hover:shadow-md cursor-pointer'
          : 'bg-white border-slate-200 hover:shadow-md hover:border-teal-300'
      }`}
    >
      {/* Type · Vessel · Label  +  staff chips on the right */}
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
          {trip.label && (
            <>
              <span className="text-slate-300 text-base leading-none">·</span>
              <span className="text-xs font-semibold text-slate-500 leading-none">
                {trip.label}
              </span>
            </>
          )}
        </div>

        {/* Staff chips */}
        <div className="flex flex-wrap justify-end gap-1 shrink-0">
          {staffMembers.length === 0 && willAdd.length === 0 && (
            <span className="text-[11px] text-slate-300 italic leading-none mt-0.5">—</span>
          )}
          {staffMembers.map((s, i) => {
            const isWillRemove = assignMode && willRemove.includes(s.id);
            return (
              <button
                key={s.id ?? i}
                title={isWillRemove ? `Remove ${s.initials}` : `Click to remove ${s.initials}`}
                onClick={e => { e.stopPropagation(); onRemoveStaff?.(s.id); }}
                className={`group inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold leading-none transition-colors ${
                  isWillRemove
                    ? 'bg-red-100 text-red-500 ring-1 ring-red-300'
                    : 'bg-teal-100 text-teal-700 hover:bg-red-100 hover:text-red-500'
                }`}
              >
                <span className={`${isWillRemove ? 'hidden' : 'group-hover:hidden'}`}>{s.initials}</span>
                <span className={`${isWillRemove ? '' : 'hidden group-hover:inline'}`}>×</span>
              </button>
            );
          })}
          {/* Preview chips for staff that will be added */}
          {assignMode && willAdd.length > 0 && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-500 text-white text-[10px] font-bold leading-none ring-1 ring-teal-400">
              +{willAdd.length}
            </span>
          )}
        </div>
      </div>

      {/* Fill bar */}
      <FillBar booked={trip.booked_divers} capacity={trip.max_divers} startTime={trip.start_time} />
    </button>
  );
}
