import DatePicker from '../../components/DatePicker';

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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="w-full border-b border-slate-200 bg-white shrink-0 flex items-center shadow-sm z-10 gap-2 px-3 py-3">

      {/* Add Trip button */}
      <button
        onClick={onAddTrip}
        className="bg-teal-600 hover:bg-teal-700 text-white p-1.5 rounded-md shadow-sm transition-colors shrink-0"
        title="Schedule New Trip"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Trip pills — scrollable, fills available space */}
      <div className="flex-1 overflow-x-auto flex items-center gap-2 min-h-[44px] hide-scrollbar">
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
                    ? 'bg-teal-800 border-teal-800 text-white shadow-md'
                    : 'bg-white border-slate-300 text-slate-600 hover:border-teal-400 hover:bg-teal-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-black ${isSelected ? 'text-teal-100' : 'text-slate-800'}`}>
                    {formatTime(trip.start_time)}
                  </span>
                  <span className="text-xs font-bold truncate max-w-[120px]">
                    {trip.trip_types?.name || 'Custom'}
                  </span>
                </div>
                <div className="flex items-center justify-between w-full gap-2">
                  <span className={`text-[10px] font-medium truncate ${isSelected ? 'text-teal-200' : 'text-slate-500'}`}>
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

      {/* Date picker — always top right */}
      <div className="shrink-0 border-l border-slate-200 pl-3">
        <DatePicker value={selectedDate} onChange={onSelectDate} />
      </div>

    </div>
  );
}
