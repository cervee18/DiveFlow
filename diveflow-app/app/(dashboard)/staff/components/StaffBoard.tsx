import { useState } from 'react';
import StaffTripCard from './StaffTripCard';
import { SelectedBubble, MoveDestination, bubbleKey } from './staffTypes';

interface JobType { id: string; name: string; sort_order: number; }
interface DailyJob {
  id: string;
  job_type_id: string;
  staff_id: string;
  trip_id: string | null;
  activity_id: string | null;
  custom_label: string | null;
  'AM/PM': string | null;
  staff: { id: string; initials: string | null; first_name: string | null; last_name: string | null } | null;
}
interface CustomJobCard {
  id: string;
  halfDay: 'AM' | 'PM';
  label: string;
  jobTypeId: string;
}

interface StaffBoardProps {
  morningTrips: any[];
  afternoonTrips: any[];
  amJobs: DailyJob[];
  pmJobs: DailyJob[];
  jobTypes: JobType[];
  isLoading: boolean;
  selectedDate: string;
  selectedStaffIds: string[];
  selectedTripIds: string[];
  selectedActivityKeys: { tripId: string; activityId: string }[];
  selectedJobKeys: { jobTypeId: string; halfDay: 'AM' | 'PM'; customLabel?: string }[];
  selectedBubbles: SelectedBubble[];
  customJobCards: CustomJobCard[];
  onToggleTripSelection: (tripId: string) => void;
  onToggleActivitySelection: (tripId: string, activityId: string) => void;
  onToggleJobSelection: (jobTypeId: string, halfDay: 'AM' | 'PM', customLabel?: string) => void;
  onRemoveStaff?: (tripId: string, staffId: string) => void;
  onRemoveFromJob?: (jobTypeId: string, staffId: string, halfDay: 'AM' | 'PM') => void;
  onRemoveActivityStaff?: (tripStaffId: string, tripId: string, staffId: string) => void;
  onAssignCaptain?: (tripId: string, staffId: string) => void;
  onOpenTrip?: (tripId: string) => void;
  onToggleBubble: (bubble: SelectedBubble) => void;
  onMoveBubbles?: (dest: MoveDestination) => void;
  onAddCustomLabel: (halfDay: 'AM' | 'PM', label: string) => void;
  onDeleteCustomLabel: (halfDay: 'AM' | 'PM', label: string) => void;
}

function memberInitials(member: DailyJob['staff']): string {
  if (!member) return '?';
  if (member.initials) return member.initials;
  return `${member.first_name?.[0] ?? ''}${member.last_name?.[0] ?? ''}`.toUpperCase() || '?';
}

function JobCard({
  jobType,
  assignments,
  halfDay,
  customLabel,
  assignMode,
  bubbleMode,
  isSelectedAsTarget,
  selectedStaffIds,
  selectedBubbles,
  conflictedStaffIds,
  onToggle,
  onToggleBubble,
  onMoveBubbles,
  onDelete,
}: {
  jobType: JobType;
  assignments: DailyJob[];
  halfDay: 'AM' | 'PM';
  customLabel?: string;
  assignMode: boolean;
  bubbleMode: boolean;
  isSelectedAsTarget: boolean;
  selectedStaffIds: string[];
  selectedBubbles: SelectedBubble[];
  conflictedStaffIds: Set<string>;
  onToggle: () => void;
  onToggleBubble: (bubble: SelectedBubble) => void;
  onMoveBubbles?: (dest: MoveDestination) => void;
  onDelete?: () => void;
}) {
  const seen = new Set<string>();
  const uniqueAssignments = assignments.filter(j => {
    if (seen.has(j.staff_id)) return false;
    seen.add(j.staff_id);
    return true;
  });

  const assignedStaffIds = new Set(assignments.map(j => j.staff_id));
  const willAdd     = isSelectedAsTarget ? selectedStaffIds.filter(id => !assignedStaffIds.has(id)) : [];
  const showDivider = uniqueAssignments.length > 0 || willAdd.length > 0;

  const handleCardClick = () => {
    if (bubbleMode) {
      onMoveBubbles?.({ kind: 'job', jobTypeId: jobType.id, halfDay, ...(customLabel ? { customLabel } : {}) });
    } else if (assignMode) {
      onToggle();
    }
  };

  return (
    <div className="relative group/card">
      <div
        onClick={handleCardClick}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
          customLabel ? 'bg-indigo-50' : 'bg-slate-100'
        } ${
          bubbleMode
            ? 'border-slate-300 hover:border-violet-400 hover:ring-2 hover:ring-violet-100 cursor-pointer'
            : isSelectedAsTarget
            ? 'border-teal-400 ring-2 ring-teal-100 cursor-pointer'
            : assignMode
            ? 'border-slate-300 hover:border-teal-400 hover:ring-2 hover:ring-teal-100 cursor-pointer'
            : 'border-slate-200'
        }`}
      >
        {/* Job name */}
        <span className={`text-xs font-bold whitespace-nowrap shrink-0 ${customLabel ? 'text-indigo-600' : 'text-slate-500'}`}>
          {customLabel ?? jobType.name}
        </span>

        {showDivider && <span className="w-px h-4 bg-slate-300 shrink-0" />}

        {/* Chips */}
        <div className="flex flex-wrap gap-1">
          {uniqueAssignments.length === 0 && willAdd.length === 0 && (
            <span className="text-[11px] text-slate-400 italic">—</span>
          )}

          {uniqueAssignments.map(job => {
            const initials = memberInitials(job.staff);
            const thisBubble: SelectedBubble = {
              staffId: job.staff_id,
              source: { kind: 'job', jobTypeId: jobType.id, halfDay, ...(customLabel ? { customLabel } : {}) },
            };
            const isSelected   = selectedBubbles.some(b => bubbleKey(b) === bubbleKey(thisBubble));
            const isConflicted = conflictedStaffIds.has(job.staff_id);

            return (
              <button
                key={job.staff_id}
                title={isSelected ? `Deselect ${initials}` : `Select ${initials}`}
                onClick={e => { e.stopPropagation(); onToggleBubble(thisBubble); }}
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold leading-none transition-colors ${
                  isSelected
                    ? 'bg-violet-500 text-white ring-2 ring-violet-300'
                    : isConflicted
                    ? 'bg-rose-500 text-white ring-2 ring-rose-300 shadow-sm'
                    : customLabel
                    ? 'bg-indigo-200 text-indigo-700 hover:bg-violet-100 hover:text-violet-600'
                    : 'bg-slate-300 text-slate-700 hover:bg-violet-100 hover:text-violet-600'
                }`}
              >
                {initials}
              </button>
            );
          })}

          {willAdd.length > 0 && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-500 text-white text-[10px] font-bold leading-none ring-1 ring-teal-400">
              +{willAdd.length}
            </span>
          )}
        </div>
      </div>

      {/* Delete button — only for custom-label cards, hidden in assign/bubble mode */}
      {onDelete && !assignMode && !bubbleMode && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title={`Delete "${customLabel}" job`}
          className="absolute -top-1.5 -right-1.5 hidden group-hover/card:flex items-center justify-center w-4 h-4 rounded-full bg-slate-400 text-white text-[9px] font-bold hover:bg-rose-500 transition-colors z-10"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function AddCustomLabelInput({
  halfDay,
  onAdd,
}: {
  halfDay: 'AM' | 'PM';
  onAdd: (halfDay: 'AM' | 'PM', label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const commit = () => {
    if (value.trim()) onAdd(halfDay, value.trim());
    setValue('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-indigo-500 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add custom job
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setValue(''); setOpen(false); }
        }}
        placeholder="Job name…"
        className="flex-1 min-w-0 text-xs px-2 py-1 border border-indigo-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
      />
      <button
        onClick={commit}
        className="text-[11px] font-bold px-2 py-1 bg-indigo-500 text-white rounded-md hover:bg-indigo-600 transition-colors"
      >
        Add
      </button>
      <button
        onClick={() => { setValue(''); setOpen(false); }}
        className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

function Column({
  title,
  halfDay,
  trips,
  jobTypes,
  jobAssignments,
  isLoading,
  selectedDate,
  selectedStaffIds,
  selectedTripIds,
  selectedActivityKeys,
  selectedJobKeys,
  selectedBubbles,
  customJobCards,
  onToggleTripSelection,
  onToggleActivitySelection,
  onToggleJobSelection,
  onRemoveStaff,
  onRemoveFromJob,
  onRemoveActivityStaff,
  onAssignCaptain,
  onOpenTrip,
  onToggleBubble,
  onMoveBubbles,
  onAddCustomLabel,
  onDeleteCustomLabel,
}: {
  title: string;
  halfDay: 'AM' | 'PM';
  trips: any[];
  jobTypes: JobType[];
  jobAssignments: DailyJob[];
  isLoading: boolean;
  selectedDate: string;
  selectedStaffIds: string[];
  selectedTripIds: string[];
  selectedActivityKeys: { tripId: string; activityId: string }[];
  selectedJobKeys: { jobTypeId: string; halfDay: 'AM' | 'PM'; customLabel?: string }[];
  selectedBubbles: SelectedBubble[];
  customJobCards: CustomJobCard[];
  onToggleTripSelection: (tripId: string) => void;
  onToggleActivitySelection: (tripId: string, activityId: string) => void;
  onToggleJobSelection: (jobTypeId: string, halfDay: 'AM' | 'PM', customLabel?: string) => void;
  onRemoveStaff?: (tripId: string, staffId: string) => void;
  onRemoveFromJob?: (jobTypeId: string, staffId: string, halfDay: 'AM' | 'PM') => void;
  onRemoveActivityStaff?: (tripStaffId: string, tripId: string, staffId: string) => void;
  onAssignCaptain?: (tripId: string, staffId: string) => void;
  onOpenTrip?: (tripId: string) => void;
  onToggleBubble: (bubble: SelectedBubble) => void;
  onMoveBubbles?: (dest: MoveDestination) => void;
  onAddCustomLabel: (halfDay: 'AM' | 'PM', label: string) => void;
  onDeleteCustomLabel: (halfDay: 'AM' | 'PM', label: string) => void;
}) {
  const byType: Record<string, DailyJob[]> = {};
  for (const job of jobAssignments) {
    if (!byType[job.job_type_id]) byType[job.job_type_id] = [];
    byType[job.job_type_id].push(job);
  }

  const captainJtId = jobTypes.find(jt => jt.name === 'Captain')?.id;
  const othersJt    = jobTypes.find(jt => jt.name === 'Others');

  const TRIP_ONLY_JOBS = new Set(['Captain', 'Private', 'Course', 'Crew', 'Unassigned']);
  const gridJobTypes = jobTypes.filter(jt => !TRIP_ONLY_JOBS.has(jt.name) && jt.name !== 'Others');

  // Index Others assignments by custom_label for quick lookup
  const othersByLabel: Record<string, DailyJob[]> = {};
  if (othersJt) {
    for (const job of (byType[othersJt.id] ?? [])) {
      const label = job.custom_label ?? '(Other)';
      if (!othersByLabel[label]) othersByLabel[label] = [];
      othersByLabel[label].push(job);
    }
  }

  // Custom cards for this halfDay (authoritative list from DB)
  const colCards = customJobCards.filter(c => c.halfDay === halfDay);

  const assignMode = selectedStaffIds.length > 0;
  const bubbleMode = selectedBubbles.length > 0;

  // Conflict detection
  const unassignedJtId = jobTypes.find(jt => jt.name === 'Unassigned')?.id;
  const staffJobsMap   = new Map<string, DailyJob[]>();
  for (const j of jobAssignments) {
    if (j.job_type_id === unassignedJtId) continue;
    if (!staffJobsMap.has(j.staff_id)) staffJobsMap.set(j.staff_id, []);
    staffJobsMap.get(j.staff_id)!.push(j);
  }
  const conflictedStaffIds = new Set<string>();
  for (const [, jobs] of staffJobsMap.entries()) {
    if (jobs.length <= 1) continue;
    const distinctTripIds = new Set(jobs.map(j => j.trip_id));
    if (distinctTripIds.size === 1 && !distinctTripIds.has(null)) continue;
    conflictedStaffIds.add(jobs[0].staff_id);
  }

  const hasJobCards = gridJobTypes.length > 0 || colCards.length > 0 || (othersJt !== undefined);

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 border-r border-slate-200 last:border-r-0">
      {/* Column header */}
      <div className="shrink-0 px-6 py-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-bold text-slate-700">{title}</h2>
          {!isLoading && (
            <span className="ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500">
              {trips.length}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
        {isLoading ? (
          <>
            <div className="h-10 bg-slate-100 animate-pulse rounded-lg" />
            <div className="h-10 bg-slate-100 animate-pulse rounded-lg" />
            <div className="h-32 bg-slate-100 animate-pulse rounded-xl mt-4" />
            <div className="h-32 bg-slate-100 animate-pulse rounded-xl" />
          </>
        ) : (
          <>
            {hasJobCards && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {/* Regular job type cards */}
                  {gridJobTypes.map(jt => (
                    <JobCard
                      key={jt.id}
                      jobType={jt}
                      assignments={byType[jt.id] ?? []}
                      halfDay={halfDay}
                      assignMode={assignMode}
                      bubbleMode={bubbleMode}
                      isSelectedAsTarget={selectedJobKeys.some(k => k.jobTypeId === jt.id && k.halfDay === halfDay && !k.customLabel)}
                      selectedStaffIds={selectedStaffIds}
                      selectedBubbles={selectedBubbles}
                      conflictedStaffIds={conflictedStaffIds}
                      onToggle={() => onToggleJobSelection(jt.id, halfDay)}
                      onToggleBubble={onToggleBubble}
                      onMoveBubbles={onMoveBubbles}
                    />
                  ))}

                  {/* Custom-label "Others" cards — one per DB card entry */}
                  {othersJt && colCards.map(card => (
                    <JobCard
                      key={card.id}
                      jobType={othersJt}
                      assignments={othersByLabel[card.label] ?? []}
                      halfDay={halfDay}
                      customLabel={card.label}
                      assignMode={assignMode}
                      bubbleMode={bubbleMode}
                      isSelectedAsTarget={selectedJobKeys.some(k =>
                        k.jobTypeId === othersJt.id && k.halfDay === halfDay && k.customLabel === card.label
                      )}
                      selectedStaffIds={selectedStaffIds}
                      selectedBubbles={selectedBubbles}
                      conflictedStaffIds={conflictedStaffIds}
                      onToggle={() => onToggleJobSelection(othersJt.id, halfDay, card.label)}
                      onToggleBubble={onToggleBubble}
                      onMoveBubbles={onMoveBubbles}
                      onDelete={() => onDeleteCustomLabel(halfDay, card.label)}
                    />
                  ))}
                </div>

                {/* Add custom job input */}
                {othersJt && !bubbleMode && (
                  <div className="pt-0.5">
                    <AddCustomLabelInput halfDay={halfDay} onAdd={onAddCustomLabel} />
                  </div>
                )}
              </div>
            )}

            {/* Divider */}
            {hasJobCards && trips.length > 0 && (
              <div className="border-t border-slate-200 my-1" />
            )}

            {/* Trip cards */}
            {trips.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-300">
                <svg className="w-7 h-7 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
                </svg>
                <span className="text-sm">No trips</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {trips.map(trip => {
                  const captainStaffIds = new Set(
                    captainJtId
                      ? jobAssignments
                          .filter(j => j.trip_id === trip.id && j.job_type_id === captainJtId)
                          .map(j => j.staff_id)
                      : []
                  );
                  return (
                    <StaffTripCard
                      key={trip.id}
                      trip={trip}
                      selectedDate={selectedDate}
                      assignMode={assignMode}
                      bubbleMode={bubbleMode}
                      isSelectedAsTarget={selectedTripIds.includes(trip.id)}
                      selectedActivityIds={new Set(
                        selectedActivityKeys.filter(k => k.tripId === trip.id).map(k => k.activityId)
                      )}
                      selectedStaffIds={selectedStaffIds}
                      selectedBubbles={selectedBubbles}
                      captainStaffIds={captainStaffIds}
                      conflictedStaffIds={conflictedStaffIds}
                      onToggle={() => onToggleTripSelection(trip.id)}
                      onToggleActivity={activityId => onToggleActivitySelection(trip.id, activityId)}
                      onRemoveStaff={onRemoveStaff ? staffId => onRemoveStaff(trip.id, staffId) : undefined}
                      onRemoveActivityStaff={onRemoveActivityStaff}
                      onAssignCaptain={onAssignCaptain ? staffId => onAssignCaptain(trip.id, staffId) : undefined}
                      onOpenTrip={onOpenTrip}
                      onToggleBubble={onToggleBubble}
                      onMoveBubbles={onMoveBubbles}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function StaffBoard({
  morningTrips,
  afternoonTrips,
  amJobs,
  pmJobs,
  jobTypes,
  isLoading,
  selectedDate,
  selectedStaffIds,
  selectedTripIds,
  selectedActivityKeys,
  selectedJobKeys,
  selectedBubbles,
  customJobCards,
  onToggleTripSelection,
  onToggleActivitySelection,
  onToggleJobSelection,
  onRemoveStaff,
  onRemoveFromJob,
  onRemoveActivityStaff,
  onAssignCaptain,
  onOpenTrip,
  onToggleBubble,
  onMoveBubbles,
  onAddCustomLabel,
  onDeleteCustomLabel,
}: StaffBoardProps) {
  const sharedColumnProps = {
    jobTypes, isLoading, selectedDate, selectedStaffIds, selectedTripIds,
    selectedActivityKeys, selectedJobKeys, selectedBubbles, customJobCards,
    onToggleTripSelection, onToggleActivitySelection, onToggleJobSelection,
    onRemoveStaff, onRemoveFromJob, onRemoveActivityStaff, onAssignCaptain,
    onOpenTrip, onToggleBubble, onMoveBubbles, onAddCustomLabel, onDeleteCustomLabel,
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <Column title="Morning"   halfDay="AM" trips={morningTrips}   jobAssignments={amJobs} {...sharedColumnProps} />
      <Column title="Afternoon" halfDay="PM" trips={afternoonTrips} jobAssignments={pmJobs} {...sharedColumnProps} />
    </div>
  );
}
