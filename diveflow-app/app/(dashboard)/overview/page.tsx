'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

import OverviewTopBar from './components/OverviewTopBar';
import OverviewBoard  from './components/OverviewBoard';
import BulkAddPanel   from './components/BulkAddPanel';
import TripFormModal  from '@/app/(dashboard)/components/TripFormModal';
import TripDrawer     from '@/app/(dashboard)/components/TripDrawer';
import { getTodayStr, shiftDate, localDateStr } from './components/dateUtils';
import { type BlueprintSlot } from './components/BlueprintSlotCard';

// ── Blueprint slot helpers ────────────────────────────────────────────────────

/** Returns the vessel's capacity appropriate for the trip category. */
function vesselCapacity(vessel: any, category?: string | null): number {
  if (!vessel) return 14;
  if (category === 'Snorkel') return vessel.capacity_snorkel ?? vessel.capacity_dive ?? 14;
  return vessel.capacity_dive ?? vessel.capacity_snorkel ?? 14;
}

function localTimeHHMM(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * For each day in the window, compute the blueprint slots that should show
 * as unconfirmed placeholders (applicable slots that don't match any confirmed trip).
 */
function computeSlotsByDay(
  days: string[],
  rawSlots: any[],
  confirmedTrips: any[],
): Record<string, BlueprintSlot[]> {
  const result: Record<string, BlueprintSlot[]> = {};

  for (const day of days) {
    const [y, m, d] = day.split('-').map(Number);
    const jsDay = new Date(y, m - 1, d).getDay(); // 0=Sun … 6=Sat

    // Applicable slots: correct day-of-week AND valid_from <= this date
    const applicable = rawSlots.filter(s =>
      s.day_of_week === jsDay && s.valid_from <= day
    );

    // Among slots with the same (vessel, time), keep only the latest valid_from
    const slotMap = new Map<string, any>();
    for (const s of applicable) {
      const key = `${s.vessel_id}:${s.start_time.slice(0, 5)}`;
      const existing = slotMap.get(key);
      if (!existing || s.valid_from > existing.valid_from) {
        slotMap.set(key, s);
      }
    }

    // Keys of confirmed trips on this day: "vessel_id:HH:MM"
    const dayTrips = confirmedTrips.filter(t => localDateStr(t.start_time) === day);
    const confirmedKeys = new Set(
      dayTrips.map(t => `${t.vessel_id}:${localTimeHHMM(t.start_time)}`)
    );

    // Unconfirmed = applicable slots with no matching confirmed trip
    const unconfirmed = Array.from(slotMap.values()).filter(s => {
      const key = `${s.vessel_id}:${s.start_time.slice(0, 5)}`;
      return !confirmedKeys.has(key);
    });

    result[day] = unconfirmed.map(s => ({
      id:                    s.id,
      vessel_id:             s.vessel_id,
      vessel_abbreviation:   s.vessels?.abbreviation ?? s.vessels?.name ?? null,
      trip_type_id:          s.trip_types?.id ?? s.trip_type_id,
      trip_type_abbreviation: s.trip_types?.abbreviation ?? null,
      trip_type_color:       s.trip_types?.color ?? null,
      trip_type_category:    s.trip_types?.category ?? null,
      trip_type_capacity:    vesselCapacity(s.vessels, s.trip_types?.category),
      start_time:            s.start_time,
    }));
  }

  return result;
}

// ── Page component ────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [windowStart, setWindowStart] = useState(getTodayStr);

  // Restore saved window position from URL / localStorage after first paint
  // (must be in useEffect to avoid SSR/CSR hydration mismatch)
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const saved   = params.get('date') ?? localStorage.getItem('diveflow_date');
    if (saved && saved !== getTodayStr()) setWindowStart(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [trips,     setTrips]     = useState<any[]>([]);
  const [rawSlots,  setRawSlots]  = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userOrgId, setUserOrgId] = useState<string | null>(null);

  // Panel state
  const [isPanelOpen,     setIsPanelOpen]     = useState(false);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);

  // Add-trip modal
  const [isModalOpen,   setIsModalOpen]   = useState(false);
  const [modalDate,     setModalDate]     = useState<string | undefined>();
  const [modalSection,  setModalSection]  = useState<'am' | 'pm' | 'night' | undefined>(); // for + button flow
  const [modalTime,     setModalTime]     = useState<string | undefined>();                 // for blueprint explicit time
  const [modalVessel,   setModalVessel]   = useState<string | undefined>();
  const [modalTripType, setModalTripType] = useState<string | undefined>();
  const [modalCapacity, setModalCapacity] = useState<number | undefined>();

  // Trip drawer
  const [drawerTripId, setDrawerTripId] = useState<string | null>(null);

  // Blueprint confirm loading state
  const [confirmingSlotId, setConfirmingSlotId] = useState<string | null>(null);

  const days      = Array.from({ length: 15 }, (_, i) => shiftDate(windowStart, i));
  const windowEnd = shiftDate(windowStart, 15);

  // Keep URL in sync
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

  // Fetch schedule slots once when org is known (they don't change per window)
  useEffect(() => {
    if (!userOrgId) return;
    supabase
      .from('weekly_schedule_slots')
      .select('id, day_of_week, vessel_id, trip_type_id, start_time, valid_from, vessels(id, name, abbreviation, capacity_dive, capacity_snorkel), trip_types(id, name, abbreviation, color, category)')
      .eq('organization_id', userOrgId)
      .then(({ data }) => { if (data) setRawSlots(data); });
  }, [userOrgId]);

  // Fetch confirmed trips for the 15-day window
  const fetchTrips = useCallback(async () => {
    if (!userOrgId) return;
    setIsLoading(true);

    const [sy, sm, sd] = windowStart.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    const [ey, em, ed] = windowEnd.split('-').map(Number);
    const end   = new Date(ey, em - 1, ed, 0, 0, 0, 0);

    const { data, error } = await supabase.rpc('get_overview_trips', {
      p_org_id: userOrgId,
      p_start:  start.toISOString(),
      p_end:    end.toISOString(),
    });

    if (!error && data) setTrips(data);
    setIsLoading(false);
  }, [windowStart, userOrgId, supabase]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  // Group confirmed trips by local date
  const tripsByDay: Record<string, any[]> = {};
  for (const day of days) {
    tripsByDay[day] = trips.filter(t => localDateStr(t.start_time) === day);
  }

  // Compute unconfirmed blueprint slots per day
  const slotsByDay = useMemo(
    () => computeSlotsByDay(days, rawSlots, trips),
    [days, rawSlots, trips]
  );

  // ── Blueprint confirm handlers ─────────────────────────────────────────────

  /** Quick-confirm: creates the trip directly without opening the modal */
  const handleConfirmSlot = useCallback(async (slot: BlueprintSlot, date: string) => {
    if (!userOrgId) return;
    setConfirmingSlotId(slot.id);

    const [h, m] = slot.start_time.split(':').map(Number);
    const [y, mo, d] = date.split('-').map(Number);
    const startTime = new Date(y, mo - 1, d, h, m, 0, 0);

    await supabase.from('trips').insert({
      organization_id: userOrgId,
      vessel_id:       slot.vessel_id,
      trip_type_id:    slot.trip_type_id,
      start_time:      startTime.toISOString(),
      max_divers:      slot.trip_type_capacity,
      duration_minutes: 240,
    });

    setConfirmingSlotId(null);
    fetchTrips();
  }, [userOrgId, supabase, fetchTrips]);

  /** Edit-confirm: opens TripFormModal pre-filled with blueprint data */
  const handleEditSlot = useCallback((slot: BlueprintSlot, date: string) => {
    setModalDate(date);
    setModalTime(slot.start_time.slice(0, 5)); // explicit time from blueprint
    setModalSection(undefined);
    setModalVessel(slot.vessel_id);
    setModalTripType(slot.trip_type_id);
    setModalCapacity(slot.trip_type_capacity);
    setIsModalOpen(true);
  }, []);

  const handleTripToggle = (tripId: string) => {
    setSelectedTripIds(prev =>
      prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]
    );
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setSelectedTripIds([]);
  };

  const openAddTripModal = (date: string, section: 'am' | 'pm' | 'night') => {
    setModalDate(date);
    setModalSection(section);
    setModalTime(undefined);     // no explicit time for + button flow
    setModalVessel(undefined);
    setModalTripType(undefined);
    setModalCapacity(undefined);
    setIsModalOpen(true);
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
          slotsByDay={slotsByDay}
          isLoading={isLoading}
          confirmingSlotId={confirmingSlotId}
          selectionMode={isPanelOpen}
          selectedTripIds={selectedTripIds}
          onTripToggle={handleTripToggle}
          onAddTrip={openAddTripModal}
          onConfirmSlot={handleConfirmSlot}
          onEditSlot={handleEditSlot}
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
        timeSection={modalSection}
        preselectedVesselId={modalVessel}
        preselectedTripTypeId={modalTripType}
        preselectedCapacity={modalCapacity}
        onClose={() => {
          setIsModalOpen(false);
          setModalSection(undefined);
          setModalTime(undefined);
          setModalVessel(undefined);
          setModalTripType(undefined);
          setModalCapacity(undefined);
        }}
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
