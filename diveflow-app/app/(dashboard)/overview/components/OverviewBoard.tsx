import { parseDayLabel } from './dateUtils';
import OverviewTripCard from './OverviewTripCard';

interface OverviewBoardProps {
  days: string[];
  tripsByDay: Record<string, any[]>;
  isLoading: boolean;
  selectionMode?: boolean;
  selectedTripIds?: string[];
  onTripToggle?: (tripId: string) => void;
  onAddTrip?: (date: string) => void;
}

export default function OverviewBoard({
  days,
  tripsByDay,
  isLoading,
  selectionMode = false,
  selectedTripIds = [],
  onTripToggle,
  onAddTrip,
}: OverviewBoardProps) {
  // Card heights (px) — must match the actual rendered sizes in OverviewTripCard
  const CARD_H       = 49; // no label: border(2) + py-2.5*2(20) + h-6(24) + bottom-bar(3)
  const CARD_H_LABEL = 71; // with label: +pt-1.5(6)+pb-1(4)+text(~12) = +22
  const SECTION_LABEL_H = 14; // "Morning" / "Afternoon" <p> height
  const GAP = 4; // space-y-1

  // Height of a column's AM section — 0 if it has no AM trips
  const amSectionHeight = (trips: any[]) => {
    const am = trips.filter(t => new Date(t.start_time).getHours() < 13);
    if (!am.length) return 0;
    const cards = am.reduce((s, t) => s + (t.label ? CARD_H_LABEL : CARD_H), 0);
    return SECTION_LABEL_H + GAP + cards + (am.length - 1) * GAP;
  };

  // Tallest AM section across all days — every column's AM block is at least this tall
  const maxAmHeight = Math.max(0, ...days.map(day => amSectionHeight(tripsByDay[day] ?? [])));

  return (
    // overflow-x-auto on outer handles horizontal scroll.
    // A min-w-max wrapper inside ensures header + cards share the same width,
    // so there is no independent horizontal scroll context in the cards area.
    <div className="flex-1 min-w-0 overflow-x-auto">
      <div className="min-w-max flex flex-col h-full">

        {/* Header row — never scrolls vertically */}
        <div className="flex pl-6 shrink-0 border-b border-slate-200">
          {days.map((day, i) => {
            const { dow, day: dayNum, mon, isToday, isTomorrow } = parseDayLabel(day);
            const dayTrips = tripsByDay[day] ?? [];
            const hasTrips = dayTrips.length > 0;
            const colBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50';
            return (
              <div
                key={day}
                className={`w-44 border-r border-slate-200 last:border-r-0 px-3 py-3 ${isToday ? 'bg-teal-500' : colBg}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-sm font-bold ${isToday ? 'text-white' : 'text-slate-700'}`}>
                    {dayNum}{' '}
                    <span className={`text-xs font-normal ${isToday ? 'text-teal-100' : 'text-slate-400'}`}>
                      {mon}
                    </span>
                  </span>
                  {hasTrips && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      isToday ? 'bg-teal-400 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {dayTrips.length}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cards area — only vertical scroll, width matches header exactly */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex pl-6 min-h-full">
            {days.map((day, i) => {
              const dayTrips = tripsByDay[day] ?? [];
              const colBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50';
              const { day: dayNum, mon } = parseDayLabel(day);
              return (
                <div
                  key={day}
                  className="group/col flex flex-col w-44 border-r border-slate-200 last:border-r-0"
                >
                  <div className={`flex-1 p-1.5 ${colBg}`}>
                    {isLoading ? (
                      <div className="h-16 bg-slate-100 animate-pulse rounded-lg" />
                    ) : (() => {
                      const am = dayTrips.filter(t => new Date(t.start_time).getHours() < 13);
                      const pm = dayTrips.filter(t => new Date(t.start_time).getHours() >= 13);
                      return (
                        <>
                          {/* AM section — minHeight set to the tallest AM section across
                              all columns so the PM divider aligns regardless of label */}
                          {maxAmHeight > 0 && (
                            <div className="space-y-1" style={{ minHeight: maxAmHeight }}>
                              <p className={`px-1 pt-0.5 text-[8px] font-bold uppercase tracking-wider ${am.length > 0 ? 'text-slate-300' : 'invisible'}`}>
                                Morning
                              </p>
                              {am.map(trip => (
                                <OverviewTripCard
                                  key={trip.id}
                                  trip={trip}
                                  selectionMode={selectionMode}
                                  isSelected={selectedTripIds.includes(trip.id)}
                                  onToggle={() => onTripToggle?.(trip.id)}
                                />
                              ))}
                            </div>
                          )}

                          {/* PM section */}
                          {pm.length > 0 && (
                            <div className="space-y-1 mt-2">
                              <p className={`px-1 pt-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-300 ${maxAmHeight > 0 ? 'border-t border-slate-200 pt-2' : ''}`}>
                                Afternoon
                              </p>
                              {pm.map(trip => (
                                <OverviewTripCard
                                  key={trip.id}
                                  trip={trip}
                                  selectionMode={selectionMode}
                                  isSelected={selectedTripIds.includes(trip.id)}
                                  onToggle={() => onTripToggle?.(trip.id)}
                                />
                              ))}
                            </div>
                          )}

                          {/* Empty day */}
                          {dayTrips.length === 0 && (
                            <div className="py-6 flex justify-center">
                              <span className="text-slate-300 text-xs">—</span>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* Add-trip button — pinned to column bottom, visible on hover */}
                    {!selectionMode && onAddTrip && (
                      <button
                        onClick={() => onAddTrip(day)}
                        title={`Add trip on ${dayNum} ${mon}`}
                        className="opacity-0 group-hover/col:opacity-100 transition-opacity w-full mt-1 py-1 flex items-center justify-center gap-1 rounded-md text-slate-400 hover:text-teal-600 hover:bg-teal-50 border border-dashed border-transparent hover:border-teal-200"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
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
