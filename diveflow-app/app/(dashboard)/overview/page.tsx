'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

import OverviewTopBar from './components/OverviewTopBar';
import OverviewBoard  from './components/OverviewBoard';
import BulkAddPanel   from './components/BulkAddPanel';
import { getTodayStr, shiftDate, localDateStr } from './components/dateUtils';

export default function OverviewPage() {
  const supabase = createClient();

  const [windowStart,   setWindowStart]   = useState(getTodayStr);
  const [trips,         setTrips]         = useState<any[]>([]);
  const [isLoading,     setIsLoading]     = useState(false);
  const [userOrgId,     setUserOrgId]     = useState<string | null>(null);

  // Panel state
  const [isPanelOpen,     setIsPanelOpen]     = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);

  const days      = Array.from({ length: 15 }, (_, i) => shiftDate(windowStart, i));
  const windowEnd = shiftDate(windowStart, 15);

  // Fetch org
  useEffect(() => {
    async function getOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles').select('organization_id').eq('id', user.id).single();
        if (profile) setUserOrgId(profile.organization_id);
      }
    }
    getOrg();
  }, [supabase]);

  // Fetch trips for the 15-day window
  const fetchTrips = useCallback(async () => {
    if (!userOrgId) return;
    setIsLoading(true);

    const [sy, sm, sd] = windowStart.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    const [ey, em, ed] = windowEnd.split('-').map(Number);
    const end   = new Date(ey, em - 1, ed, 0, 0, 0, 0);

    const { data, error } = await supabase
      .from('trips')
      .select(`
        id, label, start_time, max_divers, entry_mode,
        trip_clients ( id ),
        vessels ( name, abbreviation ),
        trip_types ( name, number_of_dives )
      `)
      .eq('organization_id', userOrgId)
      .gte('start_time', start.toISOString())
      .lt('start_time', end.toISOString())
      .order('start_time', { ascending: true });

    if (!error && data) {
      setTrips(data.map(t => ({ ...t, booked_divers: t.trip_clients?.length || 0 })));
    }
    setIsLoading(false);
  }, [windowStart, userOrgId, supabase]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  // Group trips by local date
  const tripsByDay: Record<string, any[]> = {};
  for (const day of days) {
    tripsByDay[day] = trips.filter(t => localDateStr(t.start_time) === day);
  }

  const handleTripToggle = (tripId: string) => {
    setSelectedTripIds(prev =>
      prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]
    );
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setSelectedTripIds([]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      <OverviewTopBar
        windowStart={windowStart}
        onWindowStartChange={setWindowStart}
        totalTrips={trips.length}
        isLoading={isLoading}
        isPanelOpen={isPanelOpen}
        onTogglePanel={() => {
          if (isPanelOpen) {
            handleClosePanel();
          } else {
            setIsPanelOpen(true);
            setSelectedTripIds([]);
          }
        }}
      />

      <div className="flex flex-1 min-h-0">
        <OverviewBoard
          days={days}
          tripsByDay={tripsByDay}
          isLoading={isLoading}
          selectionMode={isPanelOpen}
          selectedTripIds={selectedTripIds}
          onTripToggle={handleTripToggle}
        />

        {isPanelOpen && (
          <BulkAddPanel
            userOrgId={userOrgId}
            trips={trips}
            selectedTripIds={selectedTripIds}
            onTripToggle={handleTripToggle}
            onClearTrips={() => setSelectedTripIds([])}
            onWindowStartChange={setWindowStart}
            onClose={handleClosePanel}
            onSuccess={fetchTrips}
          />
        )}
      </div>
    </div>
  );
}
