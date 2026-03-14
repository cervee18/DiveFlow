export default function TripTopBar({ 
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
    // Returns time like "08:00" or "13:00"
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="w-full border-b border-slate-200 bg-white shrink-0 flex flex-col md:flex-row shadow-sm z-10">
      
      {/* Left Side: Controls & Date */}
      <div className="p-3 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 flex items-center gap-3 shrink-0 min-w-[260px]">
        <button 
          onClick={onAddTrip}
          className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-md shadow-sm transition-colors shrink-0"
          title="Schedule New Trip"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="flex-1">
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => onSelectDate(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-800 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm text-sm font-semibold cursor-pointer"
          />
        </div>
      </div>

      {/* Right Side: Horizontal Trip Pills */}
      <div className="flex-1 overflow-x-auto flex items-center px-4 py-3 gap-2 bg-slate-50/50 hide-scrollbar min-h-[60px]">
        {isLoading ? (
          <div className="text-slate-500 text-sm italic">Loading schedule...</div>
        ) : trips.length === 0 ? (
          <div className="text-slate-400 text-sm italic">No trips scheduled for this date.</div>
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
                className={`shrink-0 transition-all flex flex-col items-start justify-center px-4 py-1.5 rounded-xl border min-w-[130px] text-left ${
                  isSelected 
                    ? 'bg-blue-800 border-blue-800 text-white shadow-md' 
                    : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                {/* Top Line: Time & Trip Type */}
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-black ${isSelected ? 'text-blue-100' : 'text-slate-800'}`}>
                    {formatTime(trip.start_time)}
                  </span>
                  <span className="text-xs font-bold truncate max-w-[120px]">
                    {trip.trip_types?.name || 'Custom'}
                  </span>
                </div>

                {/* Bottom Line: Vessel & Spaces Left */}
                <div className="flex items-center justify-between w-full gap-2">
                  <span className={`text-[10px] font-medium truncate ${isSelected ? 'text-blue-200' : 'text-slate-500'}`}>
                    {trip.vessels?.name || 'Shore'}
                  </span>
                  <span className={`text-[10px] font-black ${
                    isFull 
                      ? 'text-red-500'
                      : isSelected 
                        ? 'text-white' 
                        : 'text-slate-400'
                  }`}>
                    ({spacesLeft})
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}