import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';

// ─── Tank types (exported for use in TripManifest.tsx and printTripManifest.ts) ─

export const TANK_OPTIONS = ['air', 'eanx', '63air', '63eanx', '100air', '100eanx'] as const;
export type TankOption = typeof TANK_OPTIONS[number];

export const TANK_LABELS: Record<TankOption, string> = {
  'air':     'Air',
  'eanx':    'Eanx',
  '63air':   '63 Air',
  '63eanx':  '63 Eanx',
  '100air':  '100 Air',
  '100eanx': '100 Eanx',
};

export function nextTank(current: string | null | undefined): TankOption {
  const idx = TANK_OPTIONS.indexOf(current as TankOption);
  return TANK_OPTIONS[(idx + 1) % TANK_OPTIONS.length];
}

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface TripInfo {
  label?: string;
  start_time?: string;
  vessel?: string;
  staff?: Array<{ initials: string; isCapitan: boolean }>;
}

export const GROUP_COLORS = [
  'bg-sky-400', 'bg-violet-400', 'bg-rose-400', 'bg-amber-400',
  'bg-teal-400', 'bg-indigo-400', 'bg-orange-400', 'bg-pink-400',
];

export function formatLastDive(dateString: string): string {
  const d = new Date(dateString);
  return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseTripManifestParams {
  tripId: string;
  tripDate: string;
  numberOfDives?: number;
  tripCategory?: string;
  onManifestChange?: () => void;
  onMovedToTrip?: (trip: any) => void;
}

export function useTripManifest({
  tripId,
  tripDate,
  numberOfDives = 1,
  tripCategory,
  onManifestChange,
  onMovedToTrip,
}: UseTripManifestParams) {
  const supabase = createClient();

  const [manifest, setManifest] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [pendingChanges, setPendingChanges] = useState<Record<string, any>>({});
  const [pendingClientChanges, setPendingClientChanges] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [nextTripMap, setNextTripMap] = useState<Record<string, string>>({});
  const [clientVisitIdMap, setClientVisitIdMap] = useState<Record<string, string>>({});
  const [clientVisitInfoMap, setClientVisitInfoMap] = useState<Record<string, { visitId: string; start_date: string; end_date: string }>>({});
  const [certLevels, setCertLevels] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  // Sort manifest so group members (same visitId) are adjacent, preserving first-occurrence order
  const displayManifest = useMemo(() => {
    if (manifest.length === 0 || Object.keys(clientVisitIdMap).length === 0) return manifest;
    const visitFirstIdx: Record<string, number> = {};
    manifest.forEach((d, i) => {
      const vid = clientVisitIdMap[d.client_id];
      if (vid && !(vid in visitFirstIdx)) visitFirstIdx[vid] = i;
    });
    return [...manifest].sort((a, b) => {
      const vidA = clientVisitIdMap[a.client_id];
      const vidB = clientVisitIdMap[b.client_id];
      const keyA = vidA ? visitFirstIdx[vidA] : manifest.indexOf(a);
      const keyB = vidB ? visitFirstIdx[vidB] : manifest.indexOf(b);
      if (keyA !== keyB) return keyA - keyB;
      return manifest.indexOf(a) - manifest.indexOf(b);
    });
  }, [manifest, clientVisitIdMap]);

  // Tank summary: count each tank type across all manifest rows
  const tankSummary = useMemo(() => {
    if (manifest.length === 0 || numberOfDives === 0) return [];
    const counts: Record<string, number> = {};
    for (const diver of manifest) {
      const row = pendingChanges[diver.id] || {};
      if (numberOfDives >= 1) {
        const t = (row.tank1 ?? diver.tank1 ?? 'air') as string;
        counts[t] = (counts[t] || 0) + 1;
      }
      if (numberOfDives >= 2) {
        const t = (row.tank2 ?? diver.tank2 ?? 'air') as string;
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return TANK_OPTIONS.filter(opt => counts[opt] > 0).map(opt => ({
      label: TANK_LABELS[opt],
      count: counts[opt],
      isEanx: opt.endsWith('eanx'),
    }));
  }, [manifest, pendingChanges, numberOfDives]);

  // Sync all ping animations to the same phase of the 1s cycle
  const pingDelay = useMemo(() => `${-(Date.now() % 1000)}ms`, []);

  const fetchData = useCallback(async () => {
    if (!tripId) return;
    setIsLoading(true);

    const { data: manifestData, error: manifestError } = await supabase
      .from('trip_clients')
      .select(`
        *,
        clients (
          first_name,
          last_name,
          last_dive_date,
          cert_level,
          certification_levels!cert_level ( abbreviation )
        ),
        courses ( name ),
        activities ( name )
      `)
      .eq('trip_id', tripId)
      .order('id', { ascending: true });

    if (manifestError) console.error('Error fetching manifest:', manifestError);

    const { data: catData } = await supabase
      .from('equipment_categories')
      .select('name, sizes');

    const { data: certData } = await supabase
      .from('certification_levels')
      .select('id, abbreviation')
      .order('abbreviation', { ascending: true });

    let activityQuery = supabase
      .from('activities')
      .select('id, name, category')
      .order('name', { ascending: true });
    if (tripCategory) activityQuery = activityQuery.eq('category', tripCategory);
    const { data: activityData } = await activityQuery;

    if (manifestData) setManifest(manifestData);
    if (catData) setCategories(catData);
    if (certData) setCertLevels(certData);
    if (activityData) setActivities(activityData);

    // Compute "Next" column labels
    if (manifestData && manifestData.length > 0) {
      const clientIds = [...new Set(manifestData.map((d: any) => d.client_id))];
      const d = new Date(tripDate);
      const tripDateOnly = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const { data: visitData } = await supabase
        .from('visit_clients')
        .select('client_id, visit_id, visits!inner(start_date, end_date)')
        .in('client_id', clientIds)
        .lte('visits.start_date', tripDateOnly)
        .gte('visits.end_date', tripDateOnly);

      const clientVisitMap: Record<string, { visitId: string; start_date: string; end_date: string }> = {};
      visitData?.forEach((v: any) => {
        clientVisitMap[v.client_id] = {
          visitId: v.visit_id,
          start_date: v.visits.start_date,
          end_date: v.visits.end_date,
        };
      });

      const visitIdByClient: Record<string, string> = {};
      Object.entries(clientVisitMap).forEach(([clientId, info]) => {
        visitIdByClient[clientId] = info.visitId;
      });
      setClientVisitIdMap(visitIdByClient);
      setClientVisitInfoMap(clientVisitMap);

      const { data: allClientTrips } = await supabase
        .from('trip_clients')
        .select('client_id, trip_id, trips!inner(start_time, trip_types(abbreviation))')
        .in('client_id', clientIds);

      const nextMap: Record<string, string> = {};
      for (const diver of manifestData) {
        const clientId = diver.client_id;
        const clientTrips = (allClientTrips || []).filter((t: any) => t.client_id === clientId);

        clientTrips.sort((a: any, b: any) =>
          new Date(a.trips.start_time).getTime() - new Date(b.trips.start_time).getTime()
        );

        // #ARR: this trip is the earliest ever for this client
        if (clientTrips.length === 0 || clientTrips[0].trip_id === tripId) {
          const visitInfoForArr = clientVisitMap[clientId];
          if (visitInfoForArr) {
            const visitTripsForArr = clientTrips.filter((t: any) => {
              const day = t.trips.start_time.substring(0, 10);
              return day >= visitInfoForArr.start_date && day <= visitInfoForArr.end_date;
            });
            const arrIdx = visitTripsForArr.findIndex((t: any) => t.trip_id === tripId);
            if (arrIdx !== -1 && arrIdx < visitTripsForArr.length - 1) {
              const nextAbbr = (visitTripsForArr[arrIdx + 1] as any).trips.trip_types?.abbreviation || '?';
              nextMap[clientId] = `#ARR|${nextAbbr}`;
              continue;
            }
            nextMap[clientId] = '#ARR|LD';
            continue;
          }
          nextMap[clientId] = '#ARR|LD';
          continue;
        }

        const visitInfo = clientVisitMap[clientId];
        if (!visitInfo) { nextMap[clientId] = 'LD'; continue; }

        const visitTrips = clientTrips.filter((t: any) => {
          const day = t.trips.start_time.substring(0, 10);
          return day >= visitInfo.start_date && day <= visitInfo.end_date;
        });

        const currentIdx = visitTrips.findIndex((t: any) => t.trip_id === tripId);

        if (currentIdx === -1) {
          nextMap[clientId] = '-';
        } else if (currentIdx === 0) {
          if (visitTrips.length > 1) {
            const nextAbbr = (visitTrips[1] as any).trips.trip_types?.abbreviation || '?';
            nextMap[clientId] = `ARR|${nextAbbr}`;
          } else {
            nextMap[clientId] = 'ARR|LD';
          }
        } else if (currentIdx < visitTrips.length - 1) {
          nextMap[clientId] = (visitTrips[currentIdx + 1] as any).trips.trip_types?.abbreviation || '?';
        } else {
          nextMap[clientId] = 'LD';
        }
      }
      setNextTripMap(nextMap);
    }

    setIsLoading(false);
  }, [tripId, tripDate, tripCategory, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleChange = (id: string, field: string, value: any) => {
    setPendingChanges(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
  };

  const handleClientChange = (clientId: string, field: string, value: any) => {
    setPendingClientChanges(prev => ({
      ...prev,
      [clientId]: { ...(prev[clientId] || {}), [field]: value },
    }));
  };

  const handleSave = async () => {
    const hasTripChanges = Object.keys(pendingChanges).length > 0;
    const hasClientChanges = Object.keys(pendingClientChanges).length > 0;
    if (!hasTripChanges && !hasClientChanges) return;
    setIsSaving(true);

    const tripPromises = Object.entries(pendingChanges).map(([id, changes]) =>
      supabase.from('trip_clients').update(changes).eq('id', id)
    );
    const clientPromises = Object.entries(pendingClientChanges).map(([clientId, changes]) =>
      supabase.from('clients').update(changes).eq('id', clientId)
    );

    const results = await Promise.all([...tripPromises, ...clientPromises]);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      alert('Error saving some changes. Check the console.');
      console.error(errors);
      setIsSaving(false);
      return;
    }

    const TRIP_ONLY_FIELDS = new Set(['waiver', 'deposit', 'notes', 'activity_id']);
    const propagatableEntries = Object.entries(pendingChanges).filter(([, changes]) =>
      Object.keys(changes).some(k => !TRIP_ONLY_FIELDS.has(k))
    );

    if (hasTripChanges && propagatableEntries.length > 0) {
      const affectedNames = propagatableEntries
        .map(([id]) => {
          const d = manifest.find(d => d.id === id);
          return d ? `${d.clients?.first_name} ${d.clients?.last_name}` : null;
        })
        .filter(Boolean)
        .join(', ');

      const applyToFuture = window.confirm(
        `Apply these changes to all future trips for ${affectedNames}?\n\nOK → update all upcoming bookings\nCancel → this trip only`
      );

      if (applyToFuture) {
        const rpcPromises = propagatableEntries.map(([id, changes]) => {
          const diver = manifest.find(d => d.id === id);
          if (!diver) return Promise.resolve({ error: null });

          const { pick_up, waiver, deposit, notes, activity_id, ...equipmentChanges } = changes;
          const hasPickUp = 'pick_up' in changes;

          return supabase.rpc('propagate_trip_client_changes', {
            p_client_id:       diver.client_id,
            p_current_trip_id: tripId,
            p_trip_date:       tripDate,
            p_equipment:       Object.keys(equipmentChanges).length > 0 ? equipmentChanges : {},
            p_pick_up:         hasPickUp ? pick_up : null,
          });
        });

        const rpcResults = await Promise.all(rpcPromises);
        const rpcErrors = rpcResults.filter(r => r.error);
        if (rpcErrors.length > 0) {
          console.error('Error propagating to future trips:', rpcErrors);
          alert('Some future trips could not be updated. Check the console for details.');
        }
      }
    }

    setPendingChanges({});
    setPendingClientChanges({});
    await fetchData();
    setIsSaving(false);
  };

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((allIds: string[]) => {
    setSelectedIds(prev => prev.size === allIds.length ? new Set() : new Set(allIds));
  }, []);

  const selectGroup = useCallback((visitId: string) => {
    const groupIds = displayManifest
      .filter(d => clientVisitIdMap[d.client_id] === visitId)
      .map(d => d.id);
    const allSelected = groupIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) groupIds.forEach(id => next.delete(id));
      else groupIds.forEach(id => next.add(id));
      return next;
    });
  }, [displayManifest, clientVisitIdMap, selectedIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleDiscard = useCallback(() => {
    setPendingChanges({});
    setPendingClientChanges({});
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Remove ${count} diver${count > 1 ? 's' : ''} from this trip?`)) return;

    setIsSaving(true);
    const ids = [...selectedIds];
    try {
      const { error } = await supabase.from('trip_clients').delete().in('id', ids);
      if (error) throw error;
      setPendingChanges(prev => {
        const next = { ...prev };
        ids.forEach(id => delete next[id]);
        return next;
      });
      setSelectedIds(new Set());
      await fetchData();
      onManifestChange?.();
    } catch (error: any) {
      console.error('Error removing divers:', error);
      alert('Could not remove divers. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [selectedIds, supabase, fetchData, onManifestChange]);

  const handleMoveSuccess = useCallback((targetTrip: any, mode: 'move' | 'add') => {
    if (mode === 'move') {
      const ids = [...selectedIds];
      const movedClientIds = displayManifest
        .filter(d => selectedIds.has(d.id))
        .map(d => d.client_id);
      setPendingChanges(prev => {
        const next = { ...prev };
        ids.forEach(id => { delete next[id]; });
        return next;
      });
      setPendingClientChanges(prev => {
        const next = { ...prev };
        movedClientIds.forEach(id => { delete next[id]; });
        return next;
      });
    }
    setSelectedIds(new Set());
    fetchData();
    onManifestChange?.();
    onMovedToTrip?.(targetTrip);
  }, [selectedIds, displayManifest, fetchData, onManifestChange, onMovedToTrip]);

  const getSizesFor = (name: string) => {
    return categories.find(c => c.name.toLowerCase() === name.toLowerCase())?.sizes || [];
  };

  return {
    manifest,
    isLoading,
    isAddModalOpen,
    setIsAddModalOpen,
    selectedIds,
    toggleSelection,
    toggleSelectAll,
    selectGroup,
    clearSelection,
    pendingChanges,
    pendingClientChanges,
    isSaving,
    nextTripMap,
    clientVisitIdMap,
    certLevels,
    activities,
    displayManifest,
    tankSummary,
    pingDelay,
    fetchData,
    handleChange,
    handleClientChange,
    handleSave,
    handleDiscard,
    handleBulkDelete,
    handleMoveSuccess,
    getSizesFor,
  };
}
