'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

import OverviewTopBar from './components/OverviewTopBar';
import OverviewBoard  from './components/OverviewBoard';
import BulkAddPanel   from './components/BulkAddPanel';
import TripFormModal  from '@/app/(dashboard)/components/TripFormModal';
import TripDrawer     from '@/app/(dashboard)/components/TripDrawer';
import { getTodayStr, shiftDate, localDateStr } from './components/dateUtils';

export default function OverviewPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [windowStart,   setWindowStart]   = useState(() => {
    if (typeof window === 'undefined') return getTodayStr();
    const params = new URLSearchParams(window.location.search);
    return params.get('date') ?? localStorage.getItem('diveflow_date') ?? getTodayStr();
  });
  const [trips,         setTrips]         = useState<any[]>([]);
  const [vessels,       setVessels]       = useState<any[]>([]);
  const [isLoading,     setIsLoading]     = useState(false);
  const [userOrgId,     setUserOrgId]     = useState<string | null>(null);

  // Panel state
  const [isPanelOpen,     setIsPanelOpen]     = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);

  // Add-trip modal
  const [isModalOpen,  setIsModalOpen]  = useState(false);
  const [modalDate,    setModalDate]    = useState<string | undefined>();
  const [modalTime,    setModalTime]    = useState<string | undefined>();

  // Trip drawer
  const [drawerTripId, setDrawerTripId] = useState<string | null>(null);

  const days      = Array.from({ length: 15 }, (_, i) => shiftDate(windowStart, i));
  const windowEnd = shiftDate(windowStart, 15);

  // Keep URL in sync and share date with other pages via localStorage
  useEffect(() => {
    router.replace(`?date=${windowStart}`, { scroll: false });
    localStorage.setItem('diveflow_date', windowStart);
  }, [windowStart]);

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

  // Fetch vessels once when org is known
  useEffect(() => {
    if (!userOrgId) return;
    supabase
      .from('vessels')
      .select('id, name, abbreviation')
      .eq('organization_id', userOrgId)
      .order('name')
      .then(({ data }) => { if (data) setVessels(data); });
  }, [userOrgId]);

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
        id, label, start_time, max_divers, entry_mode, vessel_id,
        trip_clients ( id, activities ( name, abbreviation ) ),
        vessels ( name, abbreviation ),
        trip_types ( name, abbreviation, color, category, number_of_dives )
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
          vessels={vessels}
          isLoading={isLoading}
          selectionMode={isPanelOpen}
          selectedTripIds={selectedTripIds}
          onTripToggle={handleTripToggle}
          onAddTrip={(date, time) => { setModalDate(date); setModalTime(time); setIsModalOpen(true); }}
          onOpenTrip={setDrawerTripId}
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
      <TripFormModal
        isOpen={isModalOpen}
        mode="add"
        selectedDate={modalDate}
        selectedTime={modalTime}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchTrips}
      />

      <TripDrawer
        isOpen={drawerTripId !== null}
        tripId={drawerTripId}
        onClose={() => setDrawerTripId(null)}
        onSuccess={fetchTrips}
        onMovedToTrip={(trip) => setDrawerTripId(trip.id)}
      />
    </div>
  );
}
