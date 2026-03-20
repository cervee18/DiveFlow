import { parseDayLabel } from './dateUtils';
import OverviewTripCard from './OverviewTripCard';

interface OverviewBoardProps {
  days: string[];
  tripsByDay: Record<string, any[]>;
  isLoading: boolean;
  selectionMode?: boolean;
  selectedTripIds?: string[];
  onTripToggle?: (tripId: string) => void;
}

export default function OverviewBoard({
  days,
  tripsByDay,
  isLoading,
  selectionMode = false,
  selectedTripIds = [],
  onTripToggle,
}: OverviewBoardProps) {
  return (
    // overflow-x-auto on outer handles horizontal scroll.
    // A min-w-max wrapper inside ensures header + cards share the same width,
    // so there is no independent horizontal scroll context in the cards area.
    <div className="flex-1 min-w-0 overflow-x-auto">
      <div className="min-w-max flex flex-col h-full">

        {/* Header row — never scrolls vertically */}
        <div className="flex pl-6 shrink-0 border-b border-slate-200">
          {days.map(day => {
            const { dow, day: dayNum, mon, isToday, isTomorrow } = parseDayLabel(day);
            const dayTrips = tripsByDay[day] ?? [];
            const hasTrips = dayTrips.length > 0;
            return (
              <div
                key={day}
                className={`w-52 border-r border-slate-200 last:border-r-0 px-3 py-3 ${isToday ? 'bg-teal-500' : 'bg-slate-50'}`}
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-teal-100' : 'text-slate-400'}`}>
                    {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : dow}
                  </span>
                  {hasTrips && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      isToday ? 'bg-teal-400 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {dayTrips.length}
                    </span>
                  )}
                </div>
                <div className={`text-lg font-bold leading-tight ${isToday ? 'text-white' : 'text-slate-700'}`}>
                  {dayNum}{' '}
                  <span className={`text-sm font-normal ${isToday ? 'text-teal-100' : 'text-slate-400'}`}>
                    {mon}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cards area — only vertical scroll, width matches header exactly */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex pl-6">
            {days.map(day => {
              const dayTrips = tripsByDay[day] ?? [];
              return (
                <div
                  key={day}
                  className="flex flex-col w-52 border-r border-slate-200 last:border-r-0"
                >
                  <div className="p-2 space-y-2 bg-slate-50/40">
                    {isLoading ? (
                      <div className="h-16 bg-slate-100 animate-pulse rounded-lg" />
                    ) : dayTrips.length === 0 ? (
                      <div className="py-6 flex justify-center">
                        <span className="text-slate-300 text-xs">—</span>
                      </div>
                    ) : (
                      dayTrips.map(trip => (
                        <OverviewTripCard
                          key={trip.id}
                          trip={trip}
                          selectionMode={selectionMode}
                          isSelected={selectedTripIds.includes(trip.id)}
                          onToggle={() => onTripToggle?.(trip.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
