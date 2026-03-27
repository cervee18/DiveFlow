import StaffTripCard from './StaffTripCard';

interface JobType { id: string; name: string; sort_order: number; }
interface DailyJob {
  id: string;
  job_type_id: string;
  staff_id: string;
  trip_id: string | null;
  'AM/PM': string | null;
  staff: { id: string; initials: string | null; first_name: string | null; last_name: string | null } | null;
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
  onTripAssign: (tripId: string) => void;
  onRemoveStaff: (tripId: string, staffId: string) => void;
  onJobAssign: (jobTypeId: string, halfDay: 'AM' | 'PM') => void;
  onRemoveFromJob: (jobTypeId: string, staffId: string, halfDay: 'AM' | 'PM') => void;
  onActivityAssign: (tripId: string, activityId: string) => void;
  onRemoveActivityStaff: (tripStaffId: string, tripId: string, staffId: string) => void;
  onAssignCaptain: (tripId: string, staffId: string) => void;
  onOpenTrip?: (tripId: string) => void;
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
  assignMode,
  selectedStaffIds,
  onAssign,
  onRemoveFromJob,
}: {
  jobType: JobType;
  assignments: DailyJob[];
  halfDay: 'AM' | 'PM';
  assignMode: boolean;
  selectedStaffIds: string[];
  onAssign: () => void;
  onRemoveFromJob: (jobTypeId: string, staffId: string, halfDay: 'AM' | 'PM') => void;
}) {
  // Deduplicate by staff_id — same person on two trips in same half-day
  // creates multiple rows but appears once in the card.
  const seen = new Set<string>();
  const uniqueAssignments = assignments.filter(j => {
    if (seen.has(j.staff_id)) return false;
    seen.add(j.staff_id);
    return true;
  });

  const assignedStaffIds = new Set(assignments.map(j => j.staff_id));
  const willAdd    = selectedStaffIds.filter(id => !assignedStaffIds.has(id));
  const willRemove = selectedStaffIds.filter(id =>  assignedStaffIds.has(id));
  const showDivider = uniqueAssignments.length > 0 || (assignMode && willAdd.length > 0);

  return (
    <div
      onClick={assignMode ? onAssign : undefined}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 border transition-all ${
        assignMode
          ? 'border-slate-300 hover:border-teal-400 hover:ring-2 hover:ring-teal-100 cursor-pointer'
          : 'border-slate-200'
      }`}
    >
      {/* Job name */}
      <span className="text-xs font-bold text-slate-500 whitespace-nowrap shrink-0">
        {jobType.name}
      </span>

      {showDivider && <span className="w-px h-4 bg-slate-300 shrink-0" />}

      {/* Chips — one per unique staff member */}
      <div className="flex flex-wrap gap-1">
        {uniqueAssignments.length === 0 && willAdd.length === 0 && (
          <span className="text-[11px] text-slate-400 italic">—</span>
        )}

        {uniqueAssignments.map(job => {
          const isWillRemove = assignMode && willRemove.includes(job.staff_id);
          const initials = memberInitials(job.staff);
          return (
            <button
              key={job.staff_id}
              title={isWillRemove ? `Remove ${initials}` : `Click to remove ${initials}`}
              onClick={e => { e.stopPropagation(); onRemoveFromJob(jobType.id, job.staff_id, halfDay); }}
              className={`group inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold leading-none transition-colors ${
                isWillRemove
                  ? 'bg-red-100 text-red-500 ring-1 ring-red-300'
                  : 'bg-slate-300 text-slate-700 hover:bg-red-100 hover:text-red-500'
              }`}
            >
              <span className={isWillRemove ? 'hidden' : 'group-hover:hidden'}>{initials}</span>
              <span className={isWillRemove ? '' : 'hidden group-hover:inline'}>×</span>
            </button>
          );
        })}

        {/* Preview: staff that will be added */}
        {assignMode && willAdd.length > 0 && (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-500 text-white text-[10px] font-bold leading-none ring-1 ring-teal-400">
            +{willAdd.length}
          </span>
        )}
      </div>
    </div>
  );
}

function Column({
  title,
  subtitle,
  halfDay,
  trips,
  jobTypes,
  jobAssignments,
  isLoading,
  selectedDate,
  selectedStaffIds,
  onTripAssign,
  onRemoveStaff,
  onJobAssign,
  onRemoveFromJob,
  onActivityAssign,
  onRemoveActivityStaff,
  onAssignCaptain,
  onOpenTrip,
}: {
  title: string;
  subtitle: string;
  halfDay: 'AM' | 'PM';
  trips: any[];
  jobTypes: JobType[];
  jobAssignments: DailyJob[];
  isLoading: boolean;
  selectedDate: string;
  selectedStaffIds: string[];
  onTripAssign: (tripId: string) => void;
  onRemoveStaff: (tripId: string, staffId: string) => void;
  onJobAssign: (jobTypeId: string, halfDay: 'AM' | 'PM') => void;
  onRemoveFromJob: (jobTypeId: string, staffId: string, halfDay: 'AM' | 'PM') => void;
  onActivityAssign: (tripId: string, activityId: string) => void;
  onRemoveActivityStaff: (tripStaffId: string, tripId: string, staffId: string) => void;
  onAssignCaptain: (tripId: string, staffId: string) => void;
  onOpenTrip?: (tripId: string) => void;
}) {
  // Group job assignments by job_type_id
  const byType: Record<string, DailyJob[]> = {};
  for (const job of jobAssignments) {
    if (!byType[job.job_type_id]) byType[job.job_type_id] = [];
    byType[job.job_type_id].push(job);
  }

  // Captain job type id — used to compute per-trip captain sets
  const captainJtId = jobTypes.find(jt => jt.name === 'Captain')?.id;

  // These job types are either auto-synced from trips or auto-generated —
  // they should not appear as manual assignment cards in the grid.
  const TRIP_ONLY_JOBS = new Set(['Captain', 'Private', 'Course', 'Crew', 'Unassigned']);
  const gridJobTypes = jobTypes.filter(jt => !TRIP_ONLY_JOBS.has(jt.name));

  const assignMode = selectedStaffIds.length > 0;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 border-r border-slate-200 last:border-r-0">
      {/* Column header */}
      <div className="shrink-0 px-6 py-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-bold text-slate-700">{title}</h2>
          <span className="text-xs text-slate-400">{subtitle}</span>
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
            {/* Job type cards — 2-column grid */}
            {gridJobTypes.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {gridJobTypes.map(jt => (
                  <JobCard
                    key={jt.id}
                    jobType={jt}
                    assignments={byType[jt.id] ?? []}
                    halfDay={halfDay}
                    assignMode={assignMode}
                    selectedStaffIds={selectedStaffIds}
                    onAssign={() => onJobAssign(jt.id, halfDay)}
                    onRemoveFromJob={onRemoveFromJob}
                  />
                ))}
              </div>
            )}

            {/* Divider between jobs and trips */}
            {jobTypes.length > 0 && trips.length > 0 && (
              <div className="border-t border-slate-200 my-1" />
            )}

            {/* Trip cards — 2-column grid */}
            {trips.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-300">
                <svg className="w-7 h-7 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5" />
                </svg>
                <span className="text-sm">No trips</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {trips.map(trip => {
                  // Staff whose sdj row for this trip is Captain
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
                      selectedStaffIds={selectedStaffIds}
                      captainStaffIds={captainStaffIds}
                      onAssign={() => onTripAssign(trip.id)}
                      onRemoveStaff={staffId => onRemoveStaff(trip.id, staffId)}
                      onAssignActivity={activityId => onActivityAssign(trip.id, activityId)}
                      onRemoveActivityStaff={onRemoveActivityStaff}
                      onAssignCaptain={staffId => onAssignCaptain(trip.id, staffId)}
                      onOpenTrip={onOpenTrip}
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
  onTripAssign,
  onRemoveStaff,
  onJobAssign,
  onRemoveFromJob,
  onActivityAssign,
  onRemoveActivityStaff,
  onAssignCaptain,
  onOpenTrip,
}: StaffBoardProps) {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <Column
        title="Morning"
        subtitle="before 12:00"
        halfDay="AM"
        trips={morningTrips}
        jobTypes={jobTypes}
        jobAssignments={amJobs}
        isLoading={isLoading}
        selectedDate={selectedDate}
        selectedStaffIds={selectedStaffIds}
        onTripAssign={onTripAssign}
        onRemoveStaff={onRemoveStaff}
        onJobAssign={onJobAssign}
        onRemoveFromJob={onRemoveFromJob}
        onActivityAssign={onActivityAssign}
        onRemoveActivityStaff={onRemoveActivityStaff}
        onAssignCaptain={onAssignCaptain}
        onOpenTrip={onOpenTrip}
      />
      <Column
        title="Afternoon & Night"
        subtitle="12:00 and later"
        halfDay="PM"
        trips={afternoonTrips}
        jobTypes={jobTypes}
        jobAssignments={pmJobs}
        isLoading={isLoading}
        selectedDate={selectedDate}
        selectedStaffIds={selectedStaffIds}
        onTripAssign={onTripAssign}
        onRemoveStaff={onRemoveStaff}
        onJobAssign={onJobAssign}
        onRemoveFromJob={onRemoveFromJob}
        onActivityAssign={onActivityAssign}
        onRemoveActivityStaff={onRemoveActivityStaff}
        onAssignCaptain={onAssignCaptain}
        onOpenTrip={onOpenTrip}
      />
    </div>
  );
}
