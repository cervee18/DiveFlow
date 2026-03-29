'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function MoveClientModal({
  isOpen,
  onClose,
  divers,
  mode = 'move',
  currentTripId,
  currentTripDate,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  divers: any[];
  mode?: 'move' | 'add';
  currentTripId: string;
  currentTripDate: string;
  onSuccess: (targetTrip: any, mode: 'move' | 'add') => void;
}) {
  const supabase = createClient();
  const isAdd = mode === 'add';
  const accentColor = isAdd ? 'emerald' : 'teal';

  const getLocalDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [selectedDate, setSelectedDate] = useState('');
  const [trips, setTrips] = useState<any[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(false);
  const [isActing, setIsActing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedDate(getLocalDate(currentTripDate));
      setTrips([]);
      setIsActing(false);
    }
  }, [isOpen, currentTripDate]);

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
    if (isOpen && selectedDate) fetchTrips();
  }, [fetchTrips, isOpen, selectedDate]);

  const handleAction = async (targetTrip: any) => {
    setIsActing(true);
    let results;

    if (isAdd) {
      results = await Promise.all(
        divers.map(d =>
          supabase.from('trip_clients').insert({
            trip_id: targetTrip.id,
            client_id: d.client_id,
          })
        )
      );
    } else {
      results = await Promise.all(
        divers.map(d =>
          supabase.from('trip_clients').update({ trip_id: targetTrip.id }).eq('id', d.id)
        )
      );
    }

    const errors = results.filter((r: any) => r.error);
    if (errors.length > 0) {
      console.error(`Error ${isAdd ? 'adding' : 'moving'} diver(s):`, errors);
      alert(`Could not ${isAdd ? 'add' : 'move'} diver(s). Please try again.`);
      setIsActing(false);
    } else {
      setIsActing(false);
      onSuccess(targetTrip, mode);
    }
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (!isOpen || divers.length === 0) return null;

  const title = isAdd
    ? `Add ${divers.length} diver${divers.length > 1 ? 's' : ''} to another trip`
    : `Move ${divers.length} diver${divers.length > 1 ? 's' : ''}`;

  const names = divers.map(d => d.clients?.first_name).filter(Boolean).join(', ');

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-500 mt-0.5 truncate max-w-[300px]">{names}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Date picker */}
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Select Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className={`w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-${accentColor}-500 outline-none`}
          />
        </div>

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
                    onClick={() => handleAction(trip)}
                    disabled={isActing || isFull}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${
                      isFull
                        ? 'border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed'
                        : `border-slate-200 hover:border-${accentColor}-400 hover:bg-${accentColor}-50/40 active:bg-${accentColor}-100/60 cursor-pointer`
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

        <div className="px-5 py-3 border-t border-slate-100 shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
