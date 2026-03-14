export default function TripHeader({ trip, onEdit, onDelete }: any) {
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="border-b border-slate-200 pb-4 mb-4 flex items-center justify-between gap-4">
      
      {/* Left Side: Trip Info (Title, Time, Duration, Type) */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <h2 className="text-xl font-bold text-slate-800 truncate">
          {trip.label || trip.trip_types?.name || 'Custom Trip'}
        </h2>
        
        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium shrink-0">
          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
          <span>{formatTime(trip.start_time)}</span>
          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
          <span>{trip.duration_minutes / 60} hrs</span>
          <span className="w-1 h-1 rounded-full bg-slate-300"></span>
          <span className="text-slate-700">{trip.trip_types?.name}</span>
        </div>
      </div>

      {/* Right Side: Staff, Vessel, Actions */}
      <div className="flex items-center gap-5 shrink-0">
        
        {/* Staff Chips */}
        <div className="flex items-center gap-1.5">
          {trip.trip_staff && trip.trip_staff.length > 0 ? (
            trip.trip_staff.map((ts: any) => (
              <span 
                key={ts.staff.id} 
                className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 cursor-default hover:bg-slate-200 transition-colors"
                title={`${ts.staff.first_name} ${ts.staff.last_name} • ${ts.roles?.name || 'Unassigned'}`} 
              >
                {ts.staff.initials}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-400 italic">No Staff assigned</span>
          )}
        </div>

        {/* Vertical Divider */}
        <div className="w-px h-6 bg-slate-200"></div>

        {/* Vessel Badge */}
        <div className="flex items-center">
          {trip.vessels?.name ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-100 text-sm" title="Assigned Vessel">
              {/* Small Boat Icon */}
              <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v8l9-11h-7z" />
              </svg>
              {trip.vessels.name}
            </span>
          ) : (
            <span className="text-sm text-slate-400 italic">Shore Dive</span>
          )}
        </div>

        {/* Vertical Divider */}
        <div className="w-px h-6 bg-slate-200"></div>

        {/* Actions (Edit / Delete) */}
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(trip)} className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 rounded-md hover:bg-blue-50" title="Edit Trip">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>
          <button onClick={() => onDelete(trip.id)} className="text-slate-400 hover:text-red-600 transition-colors p-1.5 rounded-md hover:bg-red-50" title="Delete Trip">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
        
      </div>
    </div>
  );
}