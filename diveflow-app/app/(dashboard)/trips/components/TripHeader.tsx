export default function TripHeader({ trip, onEdit, onDelete }: any) {
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="border-b border-slate-100 pb-6 mb-6">
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-800 truncate">{trip.trip_types?.name}</h2>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => onEdit(trip)} className="text-slate-400 hover:text-blue-600 transition-colors p-1" title="Edit Trip">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
              <button onClick={() => onDelete(trip.id)} className="text-slate-400 hover:text-red-600 transition-colors p-1" title="Delete Trip">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
          <p className="text-slate-500 mt-2 flex items-center gap-2 text-sm">
            <span>{formatTime(trip.start_time)}</span>
            <span>•</span>
            <span>{trip.duration_minutes / 60} hrs</span>
            <span>•</span>
            <span className="font-medium text-slate-700">{trip.label}</span>
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Staff</span>
          {trip.trip_staff && trip.trip_staff.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {trip.trip_staff.map((ts: any) => (
                <span 
                  key={ts.staff.id} 
                  className="inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-md bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 cursor-default hover:bg-slate-100 transition-colors"
                  title={`${ts.staff.first_name} ${ts.staff.last_name} • ${ts.roles?.name || 'Unassigned Role'}`} 
                >
                  {ts.staff.initials}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-400 italic">Unassigned</span>
          )}
        </div>

        <div className="text-right shrink-0">
          <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assigned Vessel</span>
          {trip.vessels?.name ? (
            <span className="inline-flex items-center px-3 py-1 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-100 text-sm">
              {trip.vessels.name}
            </span>
          ) : (
            <span className="text-xs text-slate-400 italic">None</span>
          )}
        </div>
      </div>
    </div>
  );
}