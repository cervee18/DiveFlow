'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function MoveClientModal({
  isOpen,
  onClose,
  diver,
  companions = [],
  currentTripId,
  currentTripDate,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  diver: any;
  companions?: any[];
  currentTripId: string;
  currentTripDate: string;
  onSuccess: (targetTrip: any) => void;
}) {
  const supabase = createClient();

  const getLocalDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // step: 'members' only shown when there are companions; otherwise jump straight to 'trip'
  const [step, setStep] = useState<'members' | 'trip'>('trip');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  const [selectedDate, setSelectedDate] = useState('');
  const [trips, setTrips] = useState<any[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  // Reset state whenever modal opens
  useEffect(() => {
    if (isOpen && diver) {
      setSelectedDate(getLocalDate(currentTripDate));
      setSelectedMemberIds(new Set([diver.id, ...companions.map((c: any) => c.id)]));
      setStep(companions.length > 0 ? 'members' : 'trip');
      setTrips([]);
    }
  }, [isOpen, diver, companions, currentTripDate]);

  const fetchTrips = useCallback(async () => {
    if (!selectedDate) return;
    setIsLoadingTrips(true);
    const { data } = await supabase
      .from('trips')
      .select('id, start_time, label, max_divers, trip_types(name), vessels(name), trip_clients(id)')
      .gte('start_time', `${selectedDate}T00:00:00`)
      .lte('start_time', `${selectedDate}T23:59:59`)
      .neq('id', currentTripId)
      .order('start_time', { ascending: true });
    setTrips(data || []);
    setIsLoadingTrips(false);
  }, [selectedDate, currentTripId, supabase]);

  useEffect(() => {
    if (isOpen && step === 'trip' && selectedDate) fetchTrips();
  }, [fetchTrips, isOpen, step, selectedDate]);

  const toggleMember = (id: string) => {
    if (id === diver?.id) return; // initiating diver cannot be deselected
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMove = async (targetTrip: any) => {
    setIsMoving(true);
    const ids = [...selectedMemberIds];
    const results = await Promise.all(
      ids.map(id => supabase.from('trip_clients').update({ trip_id: targetTrip.id }).eq('id', id))
    );
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      alert('Error moving diver(s): ' + errors[0].error?.message);
      setIsMoving(false);
    } else {
      onSuccess(targetTrip);
    }
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (!isOpen || !diver) return null;

  const allMembers = [diver, ...companions];
  const clientName = `${diver.clients?.first_name} ${diver.clients?.last_name}`;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {companions.length > 0 ? 'Move Party' : 'Move Diver'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{clientName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicator (only shown when there are companions) */}
        {companions.length > 0 && (
          <div className="px-5 pt-4 shrink-0 flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${step === 'members' ? 'text-teal-600' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'members' ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-500'}`}>1</span>
              Select Members
            </div>
            <div className="flex-1 h-px bg-slate-200" />
            <div className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${step === 'trip' ? 'text-teal-600' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'trip' ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
              Choose Trip
            </div>
          </div>
        )}

        {/* ── STEP 1: Member selection ── */}
        {step === 'members' && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-xs text-slate-500 mb-3">
                {clientName} is traveling with the following party. Select who to move:
              </p>
              <div className="flex flex-col gap-2">
                {allMembers.map((member: any) => {
                  const isInitiator = member.id === diver.id;
                  const isSelected = selectedMemberIds.has(member.id);
                  const name = `${member.clients?.first_name} ${member.clients?.last_name}`;
                  return (
                    <label
                      key={member.id}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected ? 'border-teal-300 bg-teal-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
                      } ${isInitiator ? 'cursor-default' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMember(member.id)}
                        disabled={isInitiator}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-sm font-medium text-slate-800">{name}</span>
                      {isInitiator && (
                        <span className="ml-auto text-[10px] font-semibold text-teal-600 uppercase tracking-wide">Moving</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 shrink-0 flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                Cancel
              </button>
              <button
                onClick={() => setStep('trip')}
                disabled={selectedMemberIds.size === 0}
                className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
              >
                Continue →
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: Trip selection ── */}
        {step === 'trip' && (
          <>
            {/* Date picker */}
            <div className="px-5 py-4 border-b border-slate-100 shrink-0">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            {/* Moving summary pill */}
            {selectedMemberIds.size > 1 && (
              <div className="px-5 pt-3 shrink-0">
                <div className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-full px-3 py-1 text-[11px] font-semibold text-teal-700">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Moving {selectedMemberIds.size} divers
                </div>
              </div>
            )}

            {/* Trips list */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoadingTrips ? (
                <p className="text-center text-slate-400 text-sm py-8">Loading trips...</p>
              ) : trips.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">No other trips on this date</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {trips.map(trip => {
                    const diverCount = trip.trip_clients?.length ?? 0;
                    const cap = trip.max_divers ?? null;
                    const isFull = cap !== null && diverCount >= cap;
                    return (
                      <button
                        key={trip.id}
                        onClick={() => handleMove(trip)}
                        disabled={isMoving || isFull}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                          isFull
                            ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                            : 'border-slate-200 hover:border-teal-400 hover:bg-teal-50/40 active:bg-teal-100/60 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-slate-800 text-sm tabular-nums shrink-0">
                              {formatTime(trip.start_time)}
                            </span>
                            <span className="text-slate-600 text-sm truncate">
                              {trip.label || trip.trip_types?.name || 'Trip'}
                            </span>
                          </div>
                          <div className="text-xs shrink-0 flex items-center gap-1">
                            <span className={`font-bold ${isFull ? 'text-red-500' : 'text-slate-600'}`}>{diverCount}</span>
                            {cap !== null && <span className="text-slate-400">/ {cap}</span>}
                          </div>
                        </div>
                        {trip.vessels?.name && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{trip.vessels.name}</p>
                        )}
                        {isFull && (
                          <p className="text-[10px] font-semibold text-red-400 mt-0.5 uppercase tracking-wide">Full</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 shrink-0 flex justify-between">
              {companions.length > 0 ? (
                <button onClick={() => setStep('members')} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                  ← Back
                </button>
              ) : <span />}
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                Cancel
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
