import { useState, useEffect } from 'react';
import { parseDayLabel, getTodayStr } from './dateUtils';
import OverviewTripCard from './OverviewTripCard';

interface Vessel { id: string; name: string; abbreviation?: string | null; }

interface OverviewBoardProps {
  days: string[];
  tripsByDay: Record<string, any[]>;
  vessels: Vessel[];
  isLoading: boolean;
  selectionMode?: boolean;
  selectedTripIds?: string[];
  onTripToggle?: (tripId: string) => void;
  onAddTrip?: (date: string, suggestedTime?: string) => void;
  /** When provided, clicking a trip card opens it in the TripDrawer instead of navigating */
  onOpenTrip?: (tripId: string) => void;
}

// ── Idle vessel card ──────────────────────────────────────────────────────────
function IdleVesselCard({ name }: { name: string }) {
  return (
    <div className="w-full px-2 py-1 rounded-md border border-dashed border-slate-200 bg-white flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
      <span className="text-[10px] font-medium text-slate-400 truncate">{name}</span>
    </div>
  );
}

export default function OverviewBoard({
  days,
  tripsByDay,
  vessels,
  isLoading,
  selectionMode = false,
  selectedTripIds = [],
  onTripToggle,
  onAddTrip,
  onOpenTrip,
}: OverviewBoardProps) {
  // Deferred to client to avoid server/client date mismatch hydration error
  const [todayStr, setTodayStr] = useState('');
  useEffect(() => { setTodayStr(getTodayStr()); }, []);

  // Card heights (px) — must match the actual rendered sizes
  const CARD_H       = 49; // trip, no label: border(2) + py-2.5*2(20) + h-6(24) + bottom-bar(3)
  const CARD_H_LABEL = 71; // trip, with label: +22px (label strip)
  const IDLE_CARD_H  = 26; // idle vessel: border(2) + py-1*2(8) + text(~16)
  const SECTION_LABEL_H = 14; // section heading <p> height
  const GAP = 4; // space-y-1

  // Three time slots — night dives (≥ 18:00) don't block afternoon vessel availability
  const AM_END    = 12; // 00:00–11:59 → morning
  const PM_END    = 18; // 12:00–17:59 → afternoon  ≥ 18:00 → night
  type Slot = 'am' | 'pm' | 'night';
  const slotFor = (iso: string): Slot => {
    const h = new Date(iso).getHours();
    if (h < AM_END) return 'am';
    if (h < PM_END) return 'pm';
    return 'night';
  };

  // Vessels not assigned to any trip in a given slot
  const idleVessels = (trips: any[], slot: Slot) => {
    const usedIds = new Set(
      trips.filter(t => slotFor(t.start_time) === slot)
           .map((t: any) => t.vessel_id)
           .filter(Boolean)
    );
    return vessels.filter(v => !usedIds.has(v.id));
  };

  // Height of a section (trip cards + idle vessel cards).
  // Night sections never show idle vessel cards (not operationally relevant).
  const sectionHeight = (trips: any[], slot: Slot) => {
    const slotTrips = trips.filter(t => slotFor(t.start_time) === slot);
    const idle      = slot !== 'night' ? idleVessels(trips, slot) : [];
    const total     = slotTrips.length + idle.length;
    if (total === 0) return 0;
    const tripH = slotTrips.reduce((s, t) => s + (t.label ? CARD_H_LABEL : CARD_H), 0);
    const idleH = idle.length * IDLE_CARD_H;
    // space-y-1: label + each card each get one preceding GAP except the label itself
    return SECTION_LABEL_H + total * GAP + tripH + idleH;
  };

  // Tallest AM / PM section across all days — used to align the dividers
  const maxAmHeight = Math.max(0, ...days.map(day => sectionHeight(tripsByDay[day] ?? [], 'am')));
  const maxPmHeight = Math.max(0, ...days.map(day => sectionHeight(tripsByDay[day] ?? [], 'pm')));

  return (
    // overflow-x-auto on outer handles horizontal scroll.
    // A min-w-max wrapper inside ensures header + cards share the same width,
    // so there is no independent horizontal scroll context in the cards area.
    <div className="flex-1 min-w-0 overflow-x-auto">
      <div className="min-w-max flex flex-col h-full">

        {/* Header row — never scrolls vertically */}
        <div className="flex pl-6 shrink-0 border-b border-slate-200">
          {days.map((day, i) => {
            const { dow, day: dayNum, mon, isTomorrow } = parseDayLabel(day);
            const isToday = todayStr !== '' && day === todayStr;
            const dayTrips = tripsByDay[day] ?? [];
            const hasTrips = dayTrips.length > 0;
            const colBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50';
            return (
              <div
                key={day}
                className={`group/dayheader w-44 border-r border-slate-200 last:border-r-0 px-3 py-3 ${isToday ? 'bg-teal-500' : colBg}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-sm font-bold ${isToday ? 'text-white' : 'text-slate-700'}`}>
                    {dayNum}{' '}
                    <span className={`text-xs font-normal ${isToday ? 'text-teal-100' : 'text-slate-400'}`}>
                      {mon}
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    {hasTrips && (
                      <button
                        type="button"
                        title="Print pick-up list"
                        onClick={() => window.open(`/pickup-list?date=${day}`, '_blank')}
                        className={`opacity-0 group-hover/dayheader:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded hover:bg-black/10 ${isToday ? 'text-teal-100' : 'text-slate-400'}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1" />
                        </svg>
                      </button>
                    )}
                    {hasTrips && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        isToday ? 'bg-teal-400 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {dayTrips.length}
                      </span>
                    )}
                  </div>
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
                      const am    = dayTrips.filter(t => slotFor(t.start_time) === 'am');
                      const pm    = dayTrips.filter(t => slotFor(t.start_time) === 'pm');
                      const night = dayTrips.filter(t => slotFor(t.start_time) === 'night');
                      const idleAm  = idleVessels(dayTrips, 'am');
                      const idlePm  = idleVessels(dayTrips, 'pm');
                      const hasAmContent    = am.length > 0 || idleAm.length > 0;
                      const hasPmContent    = pm.length > 0 || idlePm.length > 0;
                      const hasNightContent = night.length > 0;
                      return (
                        <>
                          {/* AM section — minHeight aligns Afternoon dividers across columns */}
                          {maxAmHeight > 0 && (
                            <div className="space-y-1" style={{ minHeight: maxAmHeight }}>
                              <div className={`flex items-center justify-between px-1 pt-0.5 ${hasAmContent ? '' : 'invisible'}`}>
                                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">Morning</span>
                                {!selectionMode && onAddTrip && (
                                  <button type="button" onClick={() => onAddTrip(day, '07:45')}
                                    className="opacity-0 group-hover/col:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                  </button>
                                )}
                              </div>
                              {am.map(trip => (
                                <OverviewTripCard
                                  key={trip.id}
                                  trip={trip}
                                  selectionMode={selectionMode}
                                  isSelected={selectedTripIds.includes(trip.id)}
                                  onToggle={() => onTripToggle?.(trip.id)}
                                  onOpenTrip={onOpenTrip}
                                />
                              ))}
                              {idleAm.map(v => (
                                <IdleVesselCard key={v.id} name={v.abbreviation || v.name} />
                              ))}
                            </div>
                          )}

                          {/* PM section — minHeight aligns Night dividers across columns */}
                          {(hasPmContent || maxPmHeight > 0) && (
                            <div className="space-y-1 mt-2" style={{ minHeight: maxPmHeight || undefined }}>
                              <div className={`flex items-center justify-between px-1 pt-0.5 ${hasPmContent ? '' : 'invisible'} ${maxAmHeight > 0 ? 'border-t border-slate-200 pt-2' : ''}`}>
                                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">Afternoon</span>
                                {!selectionMode && onAddTrip && (
                                  <button type="button" onClick={() => onAddTrip(day, '13:00')}
                                    className="opacity-0 group-hover/col:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                  </button>
                                )}
                              </div>
                              {pm.map(trip => (
                                <OverviewTripCard
                                  key={trip.id}
                                  trip={trip}
                                  selectionMode={selectionMode}
                                  isSelected={selectedTripIds.includes(trip.id)}
                                  onToggle={() => onTripToggle?.(trip.id)}
                                  onOpenTrip={onOpenTrip}
                                />
                              ))}
                              {idlePm.map(v => (
                                <IdleVesselCard key={v.id} name={v.abbreviation || v.name} />
                              ))}
                            </div>
                          )}

                          {/* Night section — no idle vessels (not operationally relevant) */}
                          {hasNightContent && (
                            <div className="space-y-1 mt-2">
                              <div className="flex items-center justify-between px-1 pt-0.5 border-t border-slate-200 pt-2">
                                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">Night</span>
                                {!selectionMode && onAddTrip && (
                                  <button type="button" onClick={() => onAddTrip(day, '18:30')}
                                    className="opacity-0 group-hover/col:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50">
                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                  </button>
                                )}
                              </div>
                              {night.map(trip => (
                                <OverviewTripCard
                                  key={trip.id}
                                  trip={trip}
                                  selectionMode={selectionMode}
                                  isSelected={selectedTripIds.includes(trip.id)}
                                  onToggle={() => onTripToggle?.(trip.id)}
                                  onOpenTrip={onOpenTrip}
                                />
                              ))}
                            </div>
                          )}

                          {/* Empty day */}
                          {dayTrips.length === 0 && vessels.length === 0 && (
                            <div className="py-6 flex justify-center">
                              <span className="text-slate-300 text-xs">—</span>
                            </div>
                          )}
                        </>
                      );
                    })()}

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
