'use client';

interface TripDrawerHeaderProps {
  trip: any;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function TripDrawerHeader({ trip, onEdit, onDelete, onClose }: TripDrawerHeaderProps) {
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0">

      {/* Left: date + trip title + meta */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 font-medium leading-none mb-0.5">
            {formatDate(trip.start_time)}
          </p>
          <h2 className="text-lg font-bold text-slate-800 truncate leading-tight">
            {trip.label || trip.trip_types?.name || 'Custom Trip'}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium shrink-0">
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span>{formatTime(trip.start_time)}</span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span>{trip.duration_minutes / 60} hrs</span>
          {trip.trip_types?.name && (
            <>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span className="text-slate-700">{trip.trip_types.name}</span>
            </>
          )}
        </div>
      </div>

      {/* Right: staff + vessel + edit/delete + close */}
      <div className="flex items-center gap-4 shrink-0">

        {/* Staff chips */}
        <div className="flex items-center gap-1.5">
          {(() => {
            if (!trip.trip_staff?.length) {
              return <span className="text-xs text-slate-400 italic">No staff</span>;
            }
            const seen = new Set<string>();
            const unique = (trip.trip_staff as any[]).filter(ts => {
              if (!ts.staff || seen.has(ts.staff.id)) return false;
              seen.add(ts.staff.id);
              return true;
            });
            return unique.length > 0
              ? unique.map((ts: any) => (
                  <span
                    key={ts.staff.id}
                    title={`${ts.staff.first_name} ${ts.staff.last_name}`}
                    className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 cursor-default hover:bg-slate-200 transition-colors"
                  >
                    {ts.staff.initials}
                  </span>
                ))
              : <span className="text-xs text-slate-400 italic">No staff</span>;
          })()}
        </div>

        <div className="w-px h-6 bg-slate-200" />

        {/* Vessel */}
        {trip.vessels?.name ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-teal-50 text-teal-700 font-bold border border-teal-100 text-sm">
            <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v8l9-11h-7z" />
            </svg>
            {trip.vessels.name}
          </span>
        ) : (
          <span className="text-sm text-slate-400 italic">Shore Dive</span>
        )}

        <div className="w-px h-6 bg-slate-200" />

        {/* Edit + Delete */}
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="text-slate-400 hover:text-teal-600 transition-colors p-1.5 rounded-md hover:bg-teal-50"
            title="Edit Trip"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="text-slate-400 hover:text-red-600 transition-colors p-1.5 rounded-md hover:bg-red-50"
            title="Delete Trip"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        <div className="w-px h-6 bg-slate-200" />

        {/* Close */}
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 transition-colors p-1.5 rounded-md hover:bg-slate-100"
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

      </div>
    </div>
  );
}
