'use client';

import { useState } from 'react';
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
  /** The card body (generic assignment) is queued as a target */
  isSelectedAsTarget?: boolean;
  /** Activity IDs within this trip that are queued as targets */
  selectedActivityIds?: Set<string>;
  selectedStaffIds?: string[];
  captainStaffIds?: Set<string>;
  conflictedStaffIds?: Set<string>;
  /** Toggle this card as a generic assignment target */
  onToggle?: () => void;
  onRemoveStaff?: (staffId: string) => void;
  /** Toggle an activity as an assignment target */
  onToggleActivity?: (activityId: string) => void;
  onRemoveActivityStaff?: (tripStaffId: string, tripId: string, staffId: string) => void;
  onAssignCaptain?: (staffId: string) => void;
  onOpenTrip?: (tripId: string) => void;
}

export default function StaffTripCard({
  trip,
  selectedDate,
  assignMode = false,
  isSelectedAsTarget = false,
  selectedActivityIds = new Set(),
  selectedStaffIds = [],
  captainStaffIds = new Set(),
  conflictedStaffIds = new Set(),
  onToggle,
  onRemoveStaff,
  onToggleActivity,
  onRemoveActivityStaff,
  onAssignCaptain,
  onOpenTrip,
}: StaffTripCardProps) {
  const router = useRouter();
  const [captainMode, setCaptainMode] = useState(false);

  // ALL unique staff on this trip (generic + activity-specific, deduped by staffId)
  const allTripStaffMap = new Map<string, { staffId: string; initials: string; captainLicense: boolean }>();
  for (const ts of trip.trip_staff ?? []) {
    if (!ts.staff || allTripStaffMap.has(ts.staff_id)) continue;
    const initials =
      ts.staff.initials ||
      `${ts.staff.first_name?.[0] ?? ''}${ts.staff.last_name?.[0] ?? ''}`.toUpperCase();
    allTripStaffMap.set(ts.staff_id, {
      staffId: ts.staff.id ?? ts.staff_id,
      initials,
      captainLicense: !!ts.staff.captain_license,
    });
  }
  const allTripStaff = Array.from(allTripStaffMap.values());

  // Generic-only staff IDs (activity_id = null)
  const genericIds = new Set(
    (trip.trip_staff ?? [])
      .filter((ts: any) => !ts.activity_id)
      .map((ts: any) => ts.staff_id)
  );

  // Activity-specific staff grouped by activity_id
  const activityStaffMap: Record<string, { tripStaffId: string; staffId: string; initials: string }[]> = {};
  for (const ts of trip.trip_staff ?? []) {
    if (!ts.activity_id || !ts.staff) continue;
    const initials =
      ts.staff.initials ||
      `${ts.staff.first_name?.[0] ?? ''}${ts.staff.last_name?.[0] ?? ''}`.toUpperCase();
    if (!activityStaffMap[ts.activity_id]) activityStaffMap[ts.activity_id] = [];
    activityStaffMap[ts.activity_id].push({ tripStaffId: ts.id, staffId: ts.staff.id ?? ts.staff_id, initials });
  }

  // Only show add/remove preview when this specific card is a selected target
  const willAddToTrip      = isSelectedAsTarget ? selectedStaffIds.filter(id => !genericIds.has(id)) : [];
  const willRemoveFromTrip = isSelectedAsTarget ? selectedStaffIds.filter(id =>  genericIds.has(id)) : [];

  const hasStaff = allTripStaff.length > 0;

  const handleClick = () => {
    if (captainMode) { setCaptainMode(false); return; }
    if (assignMode) onToggle?.();
    else if (onOpenTrip) onOpenTrip(trip.id);
    else router.push(`/trips?date=${selectedDate}&tripId=${trip.id}`);
  };

  const handleStaffChipClick = (e: React.MouseEvent, staffId: string, captainLicense: boolean) => {
    e.stopPropagation();
    if (captainMode) {
      if (!captainLicense) return;
      onAssignCaptain?.(staffId);
      setCaptainMode(false);
    } else {
      onRemoveStaff?.(staffId);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => { if (!assignMode && (e.key === 'Enter' || e.key === ' ')) handleClick(); }}
      className={`w-full text-left rounded-xl p-3 shadow-sm border transition-all cursor-pointer ${
        captainMode
          ? 'bg-white border-blue-400 ring-2 ring-blue-100'
          : isSelectedAsTarget
          ? 'bg-white border-teal-400 ring-2 ring-teal-100 shadow-md'
          : assignMode
          ? 'bg-white border-slate-200 hover:border-teal-400 hover:ring-2 hover:ring-teal-100 hover:shadow-md'
          : 'bg-white border-slate-200 hover:shadow-md hover:border-teal-300'
      }`}
    >
      {/* Type · Vessel · Label  +  generic staff chips on the right */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-1.5 mb-1.5">
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

        {/* Staff chips + Captain button */}
        <div className="flex flex-col items-start lg:items-end gap-1 shrink-0">
          {/* Staff chips */}
          <div className="flex flex-wrap justify-start lg:justify-end gap-1">
            {allTripStaff.length === 0 && willAddToTrip.length === 0 && (
              <span className="text-[11px] text-slate-300 italic leading-none mt-0.5">—</span>
            )}
            {allTripStaff.map(s => {
              const isCaptain    = captainStaffIds.has(s.staffId);
              const isWillRemove = !captainMode && willRemoveFromTrip.includes(s.staffId);
              const isDisabled   = captainMode && !s.captainLicense;

              const isConflicted = conflictedStaffIds.has(s.staffId);

              let chipClass = '';
              if (isWillRemove) {
                chipClass = 'bg-red-100 text-red-500 ring-1 ring-red-300';
              } else if (isDisabled) {
                chipClass = 'bg-slate-100 text-slate-300 cursor-not-allowed opacity-50';
              } else if (isCaptain) {
                chipClass = captainMode
                  ? 'bg-blue-700 text-white ring-2 ring-blue-400 hover:bg-blue-800'
                  : 'bg-blue-700 text-white hover:bg-blue-800';
              } else if (captainMode) {
                chipClass = 'bg-teal-100 text-teal-700 ring-1 ring-blue-300 hover:bg-blue-600 hover:text-white hover:ring-blue-500';
              } else if (isConflicted) {
                chipClass = 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-300';
              } else {
                chipClass = 'bg-teal-100 text-teal-700 hover:bg-red-100 hover:text-red-500';
              }

              return (
                <button
                  key={s.staffId}
                  disabled={isDisabled}
                  title={
                    isDisabled
                      ? `${s.initials} has no captain license`
                      : captainMode
                      ? `Set ${s.initials} as Captain`
                      : isWillRemove
                      ? `Remove ${s.initials}`
                      : `Click to remove ${s.initials}`
                  }
                  onClick={e => handleStaffChipClick(e, s.staffId, s.captainLicense)}
                  className={`group inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold leading-none transition-colors ${chipClass}`}
                >
                  {captainMode ? (
                    <span>{s.initials}</span>
                  ) : (
                    <>
                      <span className={isWillRemove ? 'hidden' : 'group-hover:hidden'}>{s.initials}</span>
                      <span className={isWillRemove ? '' : 'hidden group-hover:inline'}>×</span>
                    </>
                  )}
                </button>
              );
            })}
            {willAddToTrip.length > 0 && (
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-500 text-white text-[10px] font-bold leading-none ring-1 ring-teal-400">
                +{willAddToTrip.length}
              </span>
            )}
          </div>

          {/* Captain button — only when there's staff and not in assign mode, and not Pool/Class */}
          {hasStaff && !assignMode && !['Pool', 'Class'].includes(trip.trip_types?.name) && (
            <button
              onClick={e => { e.stopPropagation(); setCaptainMode(prev => !prev); }}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors leading-none ${
                captainMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 text-slate-400 hover:bg-blue-100 hover:text-blue-600'
              }`}
            >
              {captainMode ? '✕ cancel' : '⚓ Captain'}
            </button>
          )}
        </div>
      </div>

      {/* Activity chips — non-default activities with their own staff chips */}
      {trip.activities?.length > 0 && (
        <div className="flex flex-col gap-1 mt-1.5">
          {trip.activities.map((activity: { id: string; name: string }) => {
            const assigned   = activityStaffMap[activity.id] ?? [];
            const assignedIds = new Set(assigned.map(s => s.staffId));
            const isActivityTarget = selectedActivityIds.has(activity.id);
            const willAddToActivity    = isActivityTarget ? selectedStaffIds.filter(id => !assignedIds.has(id)) : [];
            const willRemoveFromActivity = isActivityTarget ? assigned.filter(s => selectedStaffIds.includes(s.staffId)) : [];

            return (
              <div key={activity.id} className="flex items-center flex-wrap gap-1">
                {/* Activity name chip — clickable in assign mode */}
                <span
                  onClick={assignMode ? e => { e.stopPropagation(); onToggleActivity?.(activity.id); } : undefined}
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none transition-colors ${
                    isActivityTarget
                      ? 'bg-indigo-200 text-indigo-800 border border-indigo-400 cursor-pointer ring-1 ring-indigo-300'
                      : assignMode
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-300 cursor-pointer hover:bg-indigo-200 hover:border-indigo-400'
                      : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                  }`}
                >
                  {activity.name}
                </span>

                {/* Staff already assigned to this activity */}
                {assigned.map(s => {
                  const isWillRemove = willRemoveFromActivity.some(r => r.staffId === s.staffId);
                  const isConflicted = conflictedStaffIds.has(s.staffId);
                  return (
                    <button
                      key={s.tripStaffId}
                      title={isWillRemove ? `Remove ${s.initials}` : `Click to remove ${s.initials}`}
                      onClick={e => { e.stopPropagation(); onRemoveActivityStaff?.(s.tripStaffId, trip.id, s.staffId); }}
                      className={`group inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold leading-none transition-colors ${
                        isWillRemove
                          ? 'bg-red-100 text-red-500 ring-1 ring-red-300'
                          : isConflicted
                          ? 'bg-rose-500 text-white ring-2 ring-rose-300 shadow-sm'
                          : 'bg-indigo-200 text-indigo-700 hover:bg-red-100 hover:text-red-500'
                      }`}
                    >
                      <span className={isWillRemove ? 'hidden' : 'group-hover:hidden'}>{s.initials}</span>
                      <span className={isWillRemove ? '' : 'hidden group-hover:inline'}>×</span>
                    </button>
                  );
                })}

                {/* Preview: will be added to this activity */}
                {willAddToActivity.length > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500 text-white text-[9px] font-bold leading-none">
                    +{willAddToActivity.length}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Fill bar */}
      <FillBar booked={trip.booked_divers} capacity={trip.max_divers} startTime={trip.start_time} />
    </div>
  );
}
