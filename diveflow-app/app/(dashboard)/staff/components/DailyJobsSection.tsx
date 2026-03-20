// Full-width strip shown above the trip columns.
// One card per job type; each card shows staff initials chips.

interface JobType {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
}

interface DailyJob {
  id: string;
  job_type_id: string;
  staff: {
    id: string;
    initials: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

interface DailyJobsSectionProps {
  jobTypes: JobType[];
  dailyJobs: DailyJob[];
  isLoading: boolean;
}

// Fallback palette when a job_type has no color stored.
const FALLBACK_COLORS = [
  { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-200',  chip: 'bg-indigo-200 text-indigo-800'  },
  { bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200',  chip: 'bg-violet-200 text-violet-800'  },
  { bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-200',    chip: 'bg-teal-200 text-teal-800'      },
  { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200',     chip: 'bg-red-200 text-red-800'        },
  { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',   chip: 'bg-amber-200 text-amber-800'    },
  { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200',   chip: 'bg-slate-200 text-slate-700'    },
];

function getColors(index: number) {
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function staffInitials(member: DailyJob['staff']): string {
  if (!member) return '?';
  if (member.initials) return member.initials;
  return `${member.first_name?.[0] ?? ''}${member.last_name?.[0] ?? ''}`.toUpperCase() || '?';
}

export default function DailyJobsSection({
  jobTypes,
  dailyJobs,
  isLoading,
}: DailyJobsSectionProps) {
  if (!isLoading && jobTypes.length === 0) return null;

  // Group daily jobs by job_type_id
  const byType: Record<string, DailyJob[]> = {};
  for (const job of dailyJobs) {
    if (!byType[job.job_type_id]) byType[job.job_type_id] = [];
    byType[job.job_type_id].push(job);
  }

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
      {isLoading ? (
        <div className="flex gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 w-36 bg-slate-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {jobTypes.map((jt, idx) => {
            const colors   = getColors(idx);
            const assigned = byType[jt.id] ?? [];
            return (
              <div
                key={jt.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${colors.bg} ${colors.border} min-w-[120px]`}
              >
                {/* Job name */}
                <span className={`text-xs font-bold whitespace-nowrap ${colors.text}`}>
                  {jt.name}
                </span>

                {/* Divider */}
                {assigned.length > 0 && (
                  <span className={`w-px h-5 ${colors.border} border-l`} />
                )}

                {/* Staff initials chips */}
                <div className="flex flex-wrap gap-1">
                  {assigned.length === 0 ? (
                    <span className={`text-[11px] ${colors.text} opacity-50 italic`}>—</span>
                  ) : (
                    assigned.map((job, i) => (
                      <span
                        key={job.id}
                        title={`${job.staff?.first_name ?? ''} ${job.staff?.last_name ?? ''}`.trim()}
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold leading-none ${colors.chip}`}
                      >
                        {staffInitials(job.staff)}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
