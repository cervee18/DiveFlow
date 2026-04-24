'use client';

import { useState, useEffect } from 'react';
import { parseDayLabel, getTodayStr } from './dateUtils';
import OverviewTripCard from './OverviewTripCard';
import BlueprintSlotCard, { type BlueprintSlot } from './BlueprintSlotCard';
import { usePermission } from '@/app/(dashboard)/components/PermissionsContext';
import { PERMISSIONS } from '@/lib/permissions';

interface OverviewBoardProps {
  days: string[];
  tripsByDay: Record<string, any[]>;
  slotsByDay: Record<string, BlueprintSlot[]>;
  isLoading: boolean;
  confirmingSlotId: string | null;
  selectionMode?: boolean;
  selectedTripIds?: string[];
  onTripToggle?: (tripId: string) => void;
  onAddTrip?: (date: string, section: 'am' | 'pm' | 'night') => void;
  onConfirmSlot: (slot: BlueprintSlot, date: string) => void;
  onEditSlot: (slot: BlueprintSlot, date: string) => void;
  /** When provided, clicking a trip card opens it in the TripDrawer instead of navigating */
  onOpenTrip?: (tripId: string) => void;
}

export default function OverviewBoard({
  days,
  tripsByDay,
  slotsByDay,
  isLoading,
  confirmingSlotId,
  selectionMode = false,
  selectedTripIds = [],
  onTripToggle,
  onAddTrip,
  onConfirmSlot,
  onEditSlot,
  onOpenTrip,
}: OverviewBoardProps) {
  const canCreateTrip  = usePermission(PERMISSIONS.OVERVIEW_CREATE_TRIP);
  const canConfirmTrip = usePermission(PERMISSIONS.OVERVIEW_CONFIRM_TRIP);

  // Deferred to client to avoid server/client date mismatch hydration error
  const [todayStr, setTodayStr] = useState('');
  useEffect(() => { setTodayStr(getTodayStr()); }, []);

  // Card heights (px) — must match the actual rendered sizes
  const CARD_H          = 49; // trip, no label
  const CARD_H_LABEL    = 71; // trip, with label
  const BLUEPRINT_CARD_H = 49; // blueprint placeholder (same height as a trip card)
  const SECTION_LABEL_H = 14;
  const GAP = 4; // space-y-1

  // Three time slots
  const AM_END = 12;
  const PM_END = 18;
  type Slot = 'am' | 'pm' | 'night';

  const slotForIso = (iso: string): Slot => {
    const h = new Date(iso).getHours();
    if (h < AM_END) return 'am';
    if (h < PM_END) return 'pm';
    return 'night';
  };

  const slotForTime = (timeStr: string): Slot => {
    const h = parseInt(timeStr.split(':')[0], 10);
    if (h < AM_END) return 'am';
    if (h < PM_END) return 'pm';
    return 'night';
  };

  // Height of a section (trip cards + blueprint cards)
  const sectionHeight = (trips: any[], blueprints: BlueprintSlot[], slot: Slot) => {
    const slotTrips       = trips.filter(t => slotForIso(t.start_time) === slot);
    const slotBlueprints  = blueprints.filter(b => slotForTime(b.start_time) === slot);
    const total = slotTrips.length + slotBlueprints.length;
    if (total === 0) return 0;
    const tripH      = slotTrips.reduce((s, t) => s + (t.label ? CARD_H_LABEL : CARD_H), 0);
    const blueprintH = slotBlueprints.length * BLUEPRINT_CARD_H;
    return SECTION_LABEL_H + total * GAP + tripH + blueprintH;
  };

  // Tallest AM / PM section across all days — used to align the dividers
  const maxAmHeight = Math.max(0, ...days.map(day =>
    sectionHeight(tripsByDay[day] ?? [], slotsByDay[day] ?? [], 'am')
  ));
  const maxPmHeight = Math.max(0, ...days.map(day =>
    sectionHeight(tripsByDay[day] ?? [], slotsByDay[day] ?? [], 'pm')
  ));

  return (
    <div className="flex-1 min-w-0 overflow-x-auto">
      <div className="min-w-max flex flex-col h-full">

        {/* Header row */}
        <div className="flex pl-6 shrink-0 border-b border-slate-200">
          {days.map((day, i) => {
            const { dow, day: dayNum, mon, isTomorrow } = parseDayLabel(day);
            const isToday  = todayStr !== '' && day === todayStr;
            const dayTrips = tripsByDay[day] ?? [];
            const hasTrips = dayTrips.length > 0;
            const colBg    = i % 2 === 0 ? 'bg-white' : 'bg-slate-50';
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
                    </span>{' '}
                    <span className={`text-xs font-normal ${isToday ? 'text-teal-200' : 'text-slate-400'}`}>
                      {dow}
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

        {/* Cards area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex pl-6 min-h-full">
            {days.map((day, i) => {
              const dayTrips      = tripsByDay[day] ?? [];
              const dayBlueprints = slotsByDay[day] ?? [];
              const colBg         = i % 2 === 0 ? 'bg-white' : 'bg-slate-50';

              const am            = dayTrips.filter(t => slotForIso(t.start_time) === 'am');
              const pm            = dayTrips.filter(t => slotForIso(t.start_time) === 'pm');
              const night         = dayTrips.filter(t => slotForIso(t.start_time) === 'night');
              const bpAm          = dayBlueprints.filter(b => slotForTime(b.start_time) === 'am');
              const bpPm          = dayBlueprints.filter(b => slotForTime(b.start_time) === 'pm');
              const bpNight       = dayBlueprints.filter(b => slotForTime(b.start_time) === 'night');

              const hasNightContent = night.length > 0 || bpNight.length > 0;

              return (
                <div
                  key={day}
                  className="group/col flex flex-col w-44 border-r border-slate-200 last:border-r-0"
                >
                  <div className={`flex-1 p-1.5 ${colBg}`}>
                    {isLoading ? (
                      <div className="h-16 bg-slate-100 animate-pulse rounded-lg" />
                    ) : (
                      <>
                        {/* AM section */}
                        <div className="space-y-1" style={{ minHeight: maxAmHeight || undefined }}>
                          <div className="flex items-center justify-between px-1 pt-0.5">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">Morning</span>
                            {!selectionMode && onAddTrip && canCreateTrip && (
                              <button type="button" onClick={() => onAddTrip(day, 'am')}
                                className="opacity-100 lg:opacity-0 lg:group-hover/col:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50">
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
                          {bpAm.map(slot => (
                            <BlueprintSlotCard
                              key={slot.id}
                              slot={slot}
                              isConfirming={confirmingSlotId === slot.id}
                              onConfirm={canConfirmTrip ? () => onConfirmSlot(slot, day) : undefined}
                              onEdit={() => onEditSlot(slot, day)}
                            />
                          ))}
                        </div>

                        {/* PM section */}
                        <div className="space-y-1 mt-2" style={{ minHeight: maxPmHeight || undefined }}>
                          <div className={`flex items-center justify-between px-1 pt-0.5 ${maxAmHeight > 0 ? 'border-t border-slate-200 pt-2' : ''}`}>
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">Afternoon</span>
                            {!selectionMode && onAddTrip && canCreateTrip && (
                              <button type="button" onClick={() => onAddTrip(day, 'pm')}
                                className="opacity-100 lg:opacity-0 lg:group-hover/col:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50">
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
                          {bpPm.map(slot => (
                            <BlueprintSlotCard
                              key={slot.id}
                              slot={slot}
                              isConfirming={confirmingSlotId === slot.id}
                              onConfirm={canConfirmTrip ? () => onConfirmSlot(slot, day) : undefined}
                              onEdit={() => onEditSlot(slot, day)}
                            />
                          ))}
                        </div>

                        {/* Night section */}
                        {hasNightContent && (
                          <div className="space-y-1 mt-2">
                            <div className="flex items-center justify-between px-1 pt-0.5 border-t border-slate-200 pt-2">
                              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">Night</span>
                              {!selectionMode && onAddTrip && canCreateTrip && (
                                <button type="button" onClick={() => onAddTrip(day, 'night')}
                                  className="opacity-100 lg:opacity-0 lg:group-hover/col:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50">
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
                            {bpNight.map(slot => (
                              <BlueprintSlotCard
                                key={slot.id}
                                slot={slot}
                                isConfirming={confirmingSlotId === slot.id}
                                onConfirm={canConfirmTrip ? () => onConfirmSlot(slot, day) : undefined}
                                onEdit={() => onEditSlot(slot, day)}
                              />
                            ))}
                          </div>
                        )}
                      </>
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
