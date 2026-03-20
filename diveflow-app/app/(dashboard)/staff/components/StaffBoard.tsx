import StaffTripCard from './StaffTripCard';

interface JobType { id: string; name: string; sort_order: number; }
interface DailyJob {
  id: string;
  job_type_id: string;
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
}

function staffInitials(member: DailyJob['staff']): string {
  if (!member) return '?';
  if (member.initials) return member.initials;
  return `${member.first_name?.[0] ?? ''}${member.last_name?.[0] ?? ''}`.toUpperCase() || '?';
}

// Compact job-type card: slate background to distinguish from white trip cards
function JobCard({ jobType, assignments }: { jobType: JobType; assignments: DailyJob[] }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200">
      <span className="text-xs font-bold text-slate-500 whitespace-nowrap shrink-0">
        {jobType.name}
      </span>
      {assignments.length > 0 && (
        <span className="w-px h-4 bg-slate-300 shrink-0" />
      )}
      <div className="flex flex-wrap gap-1">
        {assignments.length === 0 ? (
          <span className="text-[11px] text-slate-400 italic">—</span>
        ) : (
          assignments.map(job => (
            <span
              key={job.id}
              title={`${job.staff?.first_name ?? ''} ${job.staff?.last_name ?? ''}`.trim()}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-700 text-[10px] font-bold leading-none"
            >
              {staffInitials(job.staff)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function Column({
  title,
  subtitle,
  trips,
  jobTypes,
  jobAssignments,
  isLoading,
  selectedDate,
}: {
  title: string;
  subtitle: string;
  trips: any[];
  jobTypes: JobType[];
  jobAssignments: DailyJob[];
  isLoading: boolean;
  selectedDate: string;
}) {
  // Group job assignments by job_type_id
  const byType: Record<string, DailyJob[]> = {};
  for (const job of jobAssignments) {
    if (!byType[job.job_type_id]) byType[job.job_type_id] = [];
    byType[job.job_type_id].push(job);
  }

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
            {jobTypes.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {jobTypes.map(jt => (
                  <JobCard
                    key={jt.id}
                    jobType={jt}
                    assignments={byType[jt.id] ?? []}
                  />
                ))}
              </div>
            )}

            {/* Divider between jobs and trips */}
            {jobTypes.length > 0 && trips.length > 0 && (
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
              trips.map(trip => (
                <StaffTripCard key={trip.id} trip={trip} selectedDate={selectedDate} />
              ))
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
}: StaffBoardProps) {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <Column
        title="Morning"
        subtitle="before 12:00"
        trips={morningTrips}
        jobTypes={jobTypes}
        jobAssignments={amJobs}
        isLoading={isLoading}
        selectedDate={selectedDate}
      />
      <Column
        title="Afternoon & Night"
        subtitle="12:00 and later"
        trips={afternoonTrips}
        jobTypes={jobTypes}
        jobAssignments={pmJobs}
        isLoading={isLoading}
        selectedDate={selectedDate}
      />
    </div>
  );
}
