'use client';

export type LogEntryData = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, any> | null;
  actor_name: string;
  created_at: string;
};

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr  / 24);

  if (diffSec < 60)  return 'just now';
  if (diffMin < 60)  return `${diffMin}m ago`;
  if (diffHr  < 24)  return `${diffHr}h ago`;
  if (diffDay < 7)   return `${diffDay}d ago`;
  return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function tripDisplay(m: Record<string, any>): string {
  const date = m.trip_start
    ? new Date(m.trip_start).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  // Prefer label when explicitly set
  if (m.trip_label) return `"${m.trip_label}" (${date ?? ''})`;

  // Otherwise: trip_type + vessel + date
  const context = [m.trip_type, m.vessel_name].filter(Boolean).join(' on ');
  if (context && date) return `${context} — ${date}`;
  if (context) return context;
  if (date) return date;
  return 'a trip';
}

function buildSentence(action: string, metadata: Record<string, any> | null): string {
  const m = metadata ?? {};
  const trip = tripDisplay(m);

  switch (action) {
    case 'added_to_trip':
      return `added ${m.client_name ?? 'a client'} to ${trip}`;
    case 'removed_from_trip':
      return `removed ${m.client_name ?? 'a client'} from ${trip}`;
    case 'created_trip':
      return `created trip ${trip}`;
    case 'deleted_trip':
      return `deleted trip ${trip}`;
    case 'registered_client':
      return `registered client ${m.client_name ?? ''}`.trim();
    case 'assigned_staff':
      return m.trip_label
        ? `assigned ${m.staff_name ?? 'staff'} as ${m.job_name ?? 'crew'} on ${m.trip_label}`
        : `assigned ${m.staff_name ?? 'staff'} to ${m.job_name ?? 'a job'}`;
    case 'unassigned_staff':
      return m.trip_label
        ? `removed ${m.staff_name ?? 'staff'} from ${m.job_name ?? 'crew'} on ${m.trip_label}`
        : `removed ${m.staff_name ?? 'staff'} from ${m.job_name ?? 'a job'}`;
    default:
      return action.replace(/_/g, ' ');
  }
}

const DOT_COLORS: Record<string, string> = {
  trip_client: 'bg-teal-400',
  trip:        'bg-teal-600',
  client:      'bg-blue-400',
  staff_job:   'bg-amber-400',
};

export default function LogEntry({ entry }: { entry: LogEntryData }) {
  const dot     = DOT_COLORS[entry.entity_type] ?? 'bg-slate-400';
  const sentence = buildSentence(entry.action, entry.metadata);
  const relative = formatRelativeTime(entry.created_at);
  const absolute = new Date(entry.created_at).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="flex items-start gap-3 px-4 py-3.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
      {/* Colored dot */}
      <div className="mt-[5px] shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full ${dot}`} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800">
          <span className="font-semibold">{entry.actor_name}</span>
          {' '}
          <span className="text-slate-600">{sentence}</span>
        </p>
      </div>

      {/* Timestamp */}
      <div
        className="shrink-0 text-xs text-slate-400 cursor-default"
        title={absolute}
      >
        {relative}
      </div>
    </div>
  );
}
