export default function TripSidebar({ 
  trips, 
  selectedDate, 
  selectedTripId, 
  isLoading, 
  onSelectDate, 
  onSelectTrip, 
  onAddTrip 
}: any) {
  
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-96 flex flex-col border-r border-slate-200 bg-white shrink-0">
      <div className="p-4 border-b border-slate-200 bg-slate-50 z-10 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-semibold text-slate-800">Daily Schedule</h1>
          <button 
            onClick={onAddTrip}
            className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-md shadow-sm transition-colors"
            title="Add New Trip"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        <div className="relative">
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => onSelectDate(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-50/50">
        {isLoading ? (
          <div className="text-center text-slate-500 py-8 text-sm">Loading trips...</div>
        ) : trips.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-sm">No trips scheduled for this date.</div>
        ) : (
          trips.map((trip: any) => {
            const isSelected = selectedTripId === trip.id;
            const currentMaxCapacity = trip.vessels?.capacity || trip.max_divers;
            const spacesLeft = currentMaxCapacity - trip.booked_divers;
            const isFull = spacesLeft <= 0;

            return (
              <button
                key={trip.id}
                onClick={() => onSelectTrip(trip.id)}
                className={`w-full text-left transition-all flex items-center gap-3 px-3 py-3 rounded-lg border ${
                  isSelected 
                    ? 'bg-blue-50 border-blue-600 shadow-sm' 
                    : 'bg-transparent border-transparent hover:bg-slate-100'
                }`}
              >
                <div className={`w-16 shrink-0 text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                  {formatTime(trip.start_time)}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <span className={`text-sm font-medium truncate ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                    {trip.trip_types?.name || 'Unknown Type'}
                  </span>
                  <span className={`text-[10px] truncate mt-0.5 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`}>
                    {trip.label}
                  </span>
                </div>

                <div className={`shrink-0 text-xs font-semibold px-2 py-1 rounded ${
                  isFull 
                    ? 'text-amber-700 bg-amber-100' 
                    : isSelected 
                      ? 'text-blue-700 bg-blue-100' 
                      : 'text-slate-600 bg-slate-200'
                }`}>
                  {isFull ? 'Full' : `${spacesLeft} left`}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}