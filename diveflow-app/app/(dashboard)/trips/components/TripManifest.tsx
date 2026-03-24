'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import AddDiverModal from './AddDiverModal';
import MoveClientModal from './MoveClientModal';

const TANK_OPTIONS = ['air', 'eanx', '63air', '63eanx', '100air', '100eanx'] as const;
type TankOption = typeof TANK_OPTIONS[number];

const TANK_LABELS: Record<TankOption, string> = {
  'air':     'Air',
  'eanx':    'Eanx',
  '63air':   '63 Air',
  '63eanx':  '63 Eanx',
  '100air':  '100 Air',
  '100eanx': '100 Eanx',
};

function nextTank(current: string | null | undefined): TankOption {
  const idx = TANK_OPTIONS.indexOf(current as TankOption);
  return TANK_OPTIONS[(idx + 1) % TANK_OPTIONS.length];
}

function TankChip({ value, onChange }: { value: string | null | undefined; onChange: (v: TankOption) => void }) {
  const effective = (value as TankOption) ?? 'air';
  const isEanx = effective.endsWith('eanx');
  return (
    <button
      onClick={() => onChange(nextTank(value))}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer border ${
        isEanx
          ? 'bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200'
          : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200'
      }`}
    >
      {TANK_LABELS[effective]}
    </button>
  );
}

interface TripInfo {
  label?: string;
  start_time?: string;
  vessel?: string;
  staff?: Array<{ initials: string; isCapitan: boolean }>;
}

export default function TripManifest({
  tripId,
  tripDate,
  capacity,
  numberOfDives = 1,
  tripCategory,
  onManifestChange,
  onMovedToTrip,
  tripInfo,
}: {
  tripId: string,
  tripDate: string,
  capacity?: number,
  numberOfDives?: number,
  tripCategory?: string,
  onManifestChange?: () => void,
  onMovedToTrip?: (trip: any) => void,
  tripInfo?: TripInfo,
}) {
  const supabase = createClient();
  const [manifest, setManifest] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [diverAction, setDiverAction] = useState<{ diver: any; companions: any[]; mode: 'move' | 'add' } | null>(null);
  
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
      return manifest.indexOf(a) - manifest.indexOf(b); // stable within group
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
    return TANK_OPTIONS.filter(opt => counts[opt] > 0).map(opt => ({ label: TANK_LABELS[opt], count: counts[opt], isEanx: opt.endsWith('eanx') }));
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

    if (manifestError) {
      console.error("Error fetching manifest:", manifestError);
    }

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

      // Batch query 1: active visits for all clients on this trip date
      const { data: visitData } = await supabase
        .from('visit_clients')
        .select('client_id, visit_id, visits!inner(start_date, end_date)')
        .in('client_id', clientIds)
        .lte('visits.start_date', tripDateOnly)
        .gte('visits.end_date', tripDateOnly);

      const clientVisitMap: Record<string, { visitId: string; start_date: string; end_date: string }> = {};
      visitData?.forEach((v: any) => {
        clientVisitMap[v.client_id] = { visitId: v.visit_id, start_date: v.visits.start_date, end_date: v.visits.end_date };
      });

      // Expose visitId per client for group bracket rendering
      const visitIdByClient: Record<string, string> = {};
      Object.entries(clientVisitMap).forEach(([clientId, info]) => {
        visitIdByClient[clientId] = info.visitId;
      });
      setClientVisitIdMap(visitIdByClient);
      setClientVisitInfoMap(clientVisitMap);

      // Batch query 2: ALL trip_clients for these clients across all time
      const { data: allClientTrips } = await supabase
        .from('trip_clients')
        .select('client_id, trip_id, trips!inner(start_time, trip_types(abbreviation))')
        .in('client_id', clientIds);

      const nextMap: Record<string, string> = {};
      for (const diver of manifestData) {
        const clientId = diver.client_id;
        const clientTrips = (allClientTrips || []).filter((t: any) => t.client_id === clientId);

        // Sort all trips chronologically
        clientTrips.sort((a: any, b: any) =>
          new Date(a.trips.start_time).getTime() - new Date(b.trips.start_time).getTime()
        );

        // #ARR: this trip is the earliest ever for this client
        if (clientTrips.length === 0 || clientTrips[0].trip_id === tripId) {
          nextMap[clientId] = '#ARR';
          continue;
        }

        const visitInfo = clientVisitMap[clientId];
        if (!visitInfo) { nextMap[clientId] = 'LD'; continue; }

        // Filter to trips within this visit, sorted by time
        const visitTrips = clientTrips.filter((t: any) => {
          const day = t.trips.start_time.substring(0, 10);
          return day >= visitInfo.start_date && day <= visitInfo.end_date;
        });

        const currentIdx = visitTrips.findIndex((t: any) => t.trip_id === tripId);

        if (currentIdx === -1) {
          nextMap[clientId] = '-';
        } else if (currentIdx === 0) {
          // ARR: first trip of this visit (but not first ever)
          nextMap[clientId] = 'ARR';
        } else if (currentIdx < visitTrips.length - 1) {
          // Has a next trip in this visit — show its abbreviation
          nextMap[clientId] = (visitTrips[currentIdx + 1] as any).trips.trip_types?.abbreviation || '?';
        } else {
          // LD: last trip of this visit
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
      [id]: { ...(prev[id] || {}), [field]: value }
    }));
  };

  const handleClientChange = (clientId: string, field: string, value: any) => {
    setPendingClientChanges(prev => ({
      ...prev,
      [clientId]: { ...(prev[clientId] || {}), [field]: value }
    }));
  };

  const handleSave = async () => {
    const hasTripChanges = Object.keys(pendingChanges).length > 0;
    const hasClientChanges = Object.keys(pendingClientChanges).length > 0;
    if (!hasTripChanges && !hasClientChanges) return;
    setIsSaving(true);

    // 1. Save current-trip rows
    const tripPromises = Object.entries(pendingChanges).map(([id, changes]) =>
      supabase.from('trip_clients').update(changes).eq('id', id)
    );
    const clientPromises = Object.entries(pendingClientChanges).map(([clientId, changes]) =>
      supabase.from('clients').update(changes).eq('id', clientId)
    );

    const results = await Promise.all([...tripPromises, ...clientPromises]);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      alert("Error saving some changes. Check the console.");
      console.error(errors);
      setIsSaving(false);
      return;
    }

    // 2. Offer to propagate trip_client changes to all future trips
    // Only ask if at least one diver has propagatable fields (not just trip-specific ones)
    const TRIP_ONLY_FIELDS = new Set(['waiver', 'deposit', 'notes', 'activity_id']);
    const propagatableEntries = Object.entries(pendingChanges).filter(([, changes]) =>
      Object.keys(changes).some(k => !TRIP_ONLY_FIELDS.has(k)) // has equipment or pick_up
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
          const messages = rpcErrors.map(r => r.error?.message ?? JSON.stringify(r.error)).join('\n');
          console.error("Error propagating to future trips:", messages);
          alert("Some future trips could not be updated:\n\n" + messages);
        }
      }
    }

    setPendingChanges({});
    setPendingClientChanges({});
    await fetchData();
    setIsSaving(false);
  };

  // --- NEW: Remove Diver Logic ---
  const handleRemoveDiver = async (diverToRemove: any) => {
    const clientName = `${diverToRemove.clients?.first_name} ${diverToRemove.clients?.last_name}`;

    const confirmFirst = window.confirm(`Remove ${clientName} from this trip manifest?`);
    if (!confirmFirst) return;

    setIsSaving(true);
    let tripClientIdsToDelete = [diverToRemove.id];

    try {
      const d = new Date(tripDate);
      const tripDateOnly = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // 1. Find if they have an active visit for this date
      const { data: activeVisits } = await supabase
        .from('visit_clients')
        .select('visit_id, visits!inner ( start_date, end_date )')
        .eq('client_id', diverToRemove.client_id)
        .lte('visits.start_date', tripDateOnly)
        .gte('visits.end_date', tripDateOnly);

      if (activeVisits && activeVisits.length > 0) {
        const currentVisitId = activeVisits[0].visit_id;

        // 2. Find companions on this visit
        const { data: visitCompanions } = await supabase
          .from('visit_clients')
          .select('client_id')
          .eq('visit_id', currentVisitId)
          .neq('client_id', diverToRemove.client_id);

        if (visitCompanions && visitCompanions.length > 0) {
          const companionClientIds = visitCompanions.map(vc => vc.client_id);

          // 3. Check which of those companions are ACTUALLY on this trip manifest
          const companionsOnThisTrip = manifest.filter(d => companionClientIds.includes(d.client_id));

          if (companionsOnThisTrip.length > 0) {
            const compNames = companionsOnThisTrip.map(c => c.clients?.first_name).join(', ');
            
            // 4. Trigger the second prompt
            const confirmAll = window.confirm(
              `${diverToRemove.clients?.first_name} is traveling with ${compNames}, who are also booked on this trip.\n\nDo you want to remove the entire party?\n\n(Click 'OK' to remove everyone, or 'Cancel' to ONLY remove ${diverToRemove.clients?.first_name})`
            );

            if (confirmAll) {
              tripClientIdsToDelete = [
                ...tripClientIdsToDelete,
                ...companionsOnThisTrip.map(c => c.id) // Add companion trip_client IDs to the delete array
              ];
            }
          }
        }
      }

      // 5. Execute Delete
      const { error } = await supabase
        .from('trip_clients')
        .delete()
        .in('id', tripClientIdsToDelete);

      if (error) throw error;

      // Clear any pending unsaved UI changes for the rows we just deleted
      setPendingChanges(prev => {
        const newPending = { ...prev };
        tripClientIdsToDelete.forEach(id => delete newPending[id]);
        return newPending;
      });

      await fetchData();
      if (onManifestChange) onManifestChange(); // Update the top bar count

    } catch (error: any) {
      alert("Error removing diver: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getSizesFor = (name: string) => {
    return categories.find(c => c.name.toLowerCase() === name.toLowerCase())?.sizes || [];
  };

  const formatLastDive = (dateString: string) => {
    const d = new Date(dateString);
    return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
  };

  const GROUP_COLORS = [
    'bg-sky-400', 'bg-violet-400', 'bg-rose-400', 'bg-amber-400',
    'bg-teal-400', 'bg-indigo-400', 'bg-orange-400', 'bg-pink-400',
  ];

  const printManifest = () => {
    const nd = numberOfDives ?? 1;
    const win = window.open('', '_blank');
    if (!win) return;

    // ── helpers ──────────────────────────────────────────────────────────────
    const fmtTime = (iso?: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };
    const fmtDate = (iso?: string) => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    };
    const bool = (v: any) => v ? '✓' : '✗';

    // Staff: designated captain first, no special symbol
    const staffSorted = tripInfo?.staff
      ? [...tripInfo.staff].sort((a, b) => (b.isCapitan ? 1 : 0) - (a.isCapitan ? 1 : 0))
      : [];
    const staffStr = staffSorted.map(s => s.initials).join('  ');

    // Tank summary
    const tankSummaryStr = tankSummary.map(t => `${t.count}× ${t.label}`).join('   ');

    // Dive site lines
    const diveSiteLines = Array.from({ length: nd }, (_, i) =>
      `<span class="site-label">Dive ${i + 1}:</span><span class="site-line"></span>`
    ).join('');

    // Table headers
    const diveColHeaders = Array.from({ length: nd }, (_, i) =>
      `<th class="dive-h" colspan="2">Dive ${i + 1}</th>`
    ).join('');
    const diveSubHeaders = Array.from({ length: nd }, () =>
      `<th class="sub">Depth</th><th class="sub">Time</th>`
    ).join('');

    // Table rows
    const rows = displayManifest.map((diver, idx) => {
      const row = pendingChanges[diver.id] || {};
      const cert = diver.courses?.name || diver.clients?.certification_levels?.abbreviation || '';
      const activity = diver.activities?.name || '';
      const notes = row.notes ?? diver.notes ?? '';
      const t1 = TANK_LABELS[(row.tank1 ?? diver.tank1 ?? 'air') as TankOption];
      const t2 = nd >= 2 ? TANK_LABELS[(row.tank2 ?? diver.tank2 ?? 'air') as TankOption] : '';
      const bcd = row.bcd ?? diver.bcd ?? '';
      const suit = row.wetsuit ?? diver.wetsuit ?? '';
      const fins = row.fins ?? diver.fins ?? '';
      const mask = row.mask ?? diver.mask ?? '';
      const ld = diver.clients?.last_dive_date ? formatLastDive(diver.clients.last_dive_date) : 'New';
      const eanxClass = (v: string) => v.toLowerCase().includes('eanx') ? ' eanx' : '';

      const diveCols = Array.from({ length: nd }, () =>
        `<td class="writein"></td><td class="writein"></td>`
      ).join('');

      return `
        <tr class="${idx % 2 === 1 ? 'alt' : ''}">
          <td class="num">${idx + 1}</td>
          <td class="name">${diver.clients?.first_name ?? ''} ${diver.clients?.last_name ?? ''}</td>
          <td class="bool ${(row.waiver ?? diver.waiver) ? 'ok' : 'no'}">${bool(row.waiver ?? diver.waiver)}</td>
          <td class="bool ${(row.deposit ?? diver.deposit) ? 'ok' : 'no'}">${bool(row.deposit ?? diver.deposit)}</td>
          <td class="bool ${(row.pick_up ?? diver.pick_up) ? 'ok' : ''}">${(row.pick_up ?? diver.pick_up) ? '✓' : ''}</td>
          <td class="center">${ld}</td>
          <td class="center">${cert}</td>
          <td class="center">${bcd}</td>
          <td class="center">${suit}</td>
          <td class="center">${fins}</td>
          <td class="center">${mask}</td>
          <td class="bool ${(row.regulator ?? diver.regulator) ? 'ok' : ''}">${(row.regulator ?? diver.regulator) ? '✓' : ''}</td>
          <td class="bool ${(row.computer ?? diver.computer) ? 'ok' : ''}">${(row.computer ?? diver.computer) ? '✓' : ''}</td>
          <td class="center${eanxClass(t1)}">${t1}</td>
          ${nd >= 2 ? `<td class="center${eanxClass(t2)}">${t2}</td>` : ''}
          <td class="center">${row.weights ?? diver.weights ?? ''}</td>
          <td class="bool ${(row.private ?? diver.private) ? 'ok' : ''}">${(row.private ?? diver.private) ? '✓' : ''}</td>
          <td class="activity">${activity}</td>
          <td class="notes">${notes}</td>
          ${diveCols}
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Manifest — ${tripInfo?.label ?? ''} ${fmtDate(tripInfo?.start_time)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 7pt; color: #111; }

  /* ── Header ── */
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3mm; gap: 8mm; }
  .header-left h1 { font-size: 11pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }
  .header-left .meta { font-size: 7.5pt; color: #444; margin-top: 1mm; }
  .header-left .meta span { margin-right: 5mm; }
  .header-left .staff { font-size: 7pt; color: #555; margin-top: 1mm; }
  .header-right { display: flex; flex-direction: column; gap: 2mm; flex-shrink: 0; }
  .site-row { display: flex; align-items: center; gap: 2mm; white-space: nowrap; }
  .site-label { font-size: 7pt; font-weight: 700; color: #333; width: 12mm; }
  .site-line { display: inline-block; border-bottom: 1px solid #888; width: 55mm; }
  .tanks { font-size: 6.5pt; color: #555; margin-top: 1.5mm; }
  .tanks .eanx-badge { color: #059669; font-weight: 700; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.num   { width: 5mm; }
  col.name  { width: 42mm; }
  col.bool  { width: 5mm; }
  col.pu    { width: 6mm; }
  col.ld    { width: 9mm; }
  col.cert  { width: 11mm; }
  col.gear  { width: 8mm; }
  col.tank  { width: 11mm; }
  col.wei   { width: 7mm; }
  col.act   { width: ${nd >= 2 ? '16mm' : '20mm'}; }
  col.notes { width: ${nd >= 2 ? '22mm' : '30mm'}; }
  col.dive  { width: 9mm; }

  th { background: #1e293b; color: #fff; font-size: 6pt; font-weight: 700; text-transform: uppercase;
       text-align: center; padding: 1mm 0.5mm; border: 0.3pt solid #334; }
  th.dive-h { background: #0f4c81; letter-spacing: 0.03em; }
  th.sub { background: #1a6cb5; font-size: 5.5pt; }
  th.name-h { text-align: left; padding-left: 1mm; }

  td { font-size: 6.5pt; padding: 0.8mm 0.5mm; border: 0.3pt solid #cbd5e1; vertical-align: middle; }
  td.num { text-align: center; color: #94a3b8; font-size: 6pt; }
  td.name { font-weight: 700; font-size: 7pt; }
  td.center { text-align: center; }
  td.bool { text-align: center; font-size: 7.5pt; }
  td.bool.ok { color: #16a34a; }
  td.bool.no { color: #dc2626; }
  td.activity { font-size: 6pt; }
  td.notes { font-size: 6pt; color: #475569; font-style: italic; }
  td.writein { background: #f8fafc; }
  td.eanx { color: #059669; font-weight: 700; }

  tr.alt td { background: #f8fafc; }
  tr.alt td.writein { background: #f0fdf4; }

  /* print-safe colours */
  @media print {
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    td.bool.ok, td.bool.no, td.eanx { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tr.alt td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>Dive Manifest — ${tripInfo?.label ?? 'Trip'}</h1>
      <div class="meta">
        <span>📅 ${fmtDate(tripInfo?.start_time)}</span>
        <span>🕐 ${fmtTime(tripInfo?.start_time)}</span>
        ${tripInfo?.vessel ? `<span>⛵ ${tripInfo.vessel}</span>` : ''}
        <span>👥 ${manifest.length} divers</span>
      </div>
      ${staffStr ? `<div class="staff">Staff: ${staffStr}</div>` : ''}
      ${tankSummaryStr ? `<div class="tanks">Tanks: ${tankSummary.map(t => `<span class="${t.isEanx ? 'eanx-badge' : ''}">${t.count}× ${t.label}</span>`).join('  &nbsp;')}</div>` : ''}
    </div>
    <div class="header-right">
      ${Array.from({ length: nd }, (_, i) => `
        <div class="site-row">
          <span class="site-label">Dive ${i + 1}:</span>
          <span class="site-line"></span>
        </div>`).join('')}
    </div>
  </div>

  <table>
    <colgroup>
      <col class="num"><col class="name">
      <col class="bool"><col class="bool"><col class="pu">
      <col class="ld"><col class="cert">
      <col class="gear"><col class="gear"><col class="gear"><col class="gear">
      <col class="bool"><col class="bool">
      <col class="tank">${nd >= 2 ? '<col class="tank">' : ''}
      <col class="wei"><col class="bool">
      <col class="act"><col class="notes">
      ${Array.from({ length: nd }, () => '<col class="dive"><col class="dive">').join('')}
    </colgroup>
    <thead>
      <tr>
        <th rowspan="2">#</th>
        <th class="name-h" rowspan="2">Diver Name</th>
        <th rowspan="2" title="Waiver">W</th>
        <th rowspan="2" title="Deposit">Dep</th>
        <th rowspan="2" title="Pick Up">PU</th>
        <th rowspan="2">LD</th>
        <th rowspan="2">Cert</th>
        <th rowspan="2">BCD</th>
        <th rowspan="2">Suit</th>
        <th rowspan="2">Fins</th>
        <th rowspan="2">Mask</th>
        <th rowspan="2">Reg</th>
        <th rowspan="2">Comp</th>
        <th rowspan="2">T1</th>
        ${nd >= 2 ? '<th rowspan="2">T2</th>' : ''}
        <th rowspan="2">Wei</th>
        <th rowspan="2" title="Private">Prv</th>
        <th rowspan="2">Activity</th>
        <th rowspan="2">Notes</th>
        ${diveColHeaders}
      </tr>
      <tr>${diveSubHeaders}</tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <script>setTimeout(() => { window.print(); }, 300 );</script>
</body></html>`;

    win.document.write(html);
    win.document.close();
  };

  const renderNextChip = (label: string) => {
    if (label === '#ARR') return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-violet-100 text-violet-700 border border-violet-200">#ARR</span>;
    if (label === 'ARR')  return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-100 text-sky-700 border border-sky-200">ARR</span>;
    if (label === 'LD')   return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200">LD</span>;
    if (label === '-')    return <span className="text-[10px] text-slate-300">-</span>;
    return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">{label}</span>;
  };

  return (
    <div className="flex-1 flex flex-col mt-4 relative">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Diver Manifest</h3>
          <p className="text-[10px] text-slate-500 uppercase">Interactive Sheet • Changes autosave on 'Enter'</p>
          {tankSummary.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Tanks:</span>
              {tankSummary.map(({ label, count, isEanx }) => (
                <span
                  key={label}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                    isEanx
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <span className="font-black">{count}×</span> {label}
                </span>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {(Object.keys(pendingChanges).length > 0 || Object.keys(pendingClientChanges).length > 0) && (
            <>
              <span className="text-[10px] font-bold text-amber-600 uppercase animate-pulse">Unsaved Changes</span>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-all flex items-center gap-2"
              >
                {isSaving ? 'Saving...' : 'Save All Changes'}
              </button>
            </>
          )}
          {manifest.length > 0 && (
            <button
              onClick={printManifest}
              className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
          )}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Diver
          </button>
        </div>
      </div>

      <div className="flex bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full h-full text-left border-collapse text-[11px] whitespace-nowrap min-w-max">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-tighter">
              <th className="p-0 sticky left-0 z-20 bg-slate-50" style={{ width: '10px' }} />
              <th className="px-3 py-3 border-r sticky left-[10px] bg-slate-50 z-20 shadow-[1px_0_0_0_#e2e8f0]">Diver Name</th>
              <th className="px-2 py-3 text-center" title="Waiver">
                <svg className="w-3.5 h-3.5 mx-auto text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </th>
              <th className="px-2 py-3 text-center" title="Deposit">
                <svg className="w-3.5 h-3.5 mx-auto text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
              </th>
              <th className="px-2 py-3 text-center border-r" title="Pick Up">
                <svg className="w-3.5 h-3.5 mx-auto text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1" /></svg>
              </th>
              <th className="px-3 py-3 text-center border-r">LD</th>
              <th className="px-3 py-3 text-center border-r" style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }}>Cert</th>
              {numberOfDives > 0 && <th className="px-2 py-3 text-center border-r bg-teal-50/30">BCD</th>}
              <th className="px-2 py-3 text-center border-r bg-teal-50/30">Suit</th>
              <th className="px-2 py-3 text-center border-r bg-teal-50/30">Fins</th>
              <th className="px-2 py-3 text-center border-r bg-teal-50/30">Mask</th>
              {numberOfDives > 0 && <th className="px-2 py-3 text-center border-r">Reg</th>}
              {numberOfDives > 0 && <th className="px-2 py-3 text-center border-r">Comp</th>}
              {numberOfDives >= 1 && <th className="px-2 py-3 text-center border-r">T1</th>}
              {numberOfDives >= 2 && <th className="px-2 py-3 text-center border-r">T2</th>}
              <th className="px-2 py-3 text-center border-r">Wei.</th>
              <th className="px-2 py-3 text-center border-r" title="Private Instructor">Priv</th>
              <th className="px-3 py-3 text-center border-r" style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }}>Activity</th>
              <th className="px-3 py-3 text-center border-r">Next</th>
              <th className="px-3 py-3 w-48">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(() => {
              // --- Group bracket metadata (computed once for all rows, using sorted display order) ---
              const visitCounts: Record<string, number> = {};
              displayManifest.forEach(d => {
                const vid = clientVisitIdMap[d.client_id];
                if (vid) visitCounts[vid] = (visitCounts[vid] || 0) + 1;
              });
              const groupVisitIds = [...new Set(displayManifest.map(d => clientVisitIdMap[d.client_id]).filter(Boolean))].filter(vid => visitCounts[vid] >= 2);
              const visitColorIndex: Record<string, number> = {};
              groupVisitIds.forEach((vid, i) => { visitColorIndex[vid] = i; });

              // Cert level grouping (computed once for all rows)
              const NONPROF_ORDER = ['DSD', 'SD', 'OWD', 'AOWD', 'Resc'];
              const nonprofSet = new Set(NONPROF_ORDER);
              const nonprofCertLevels = NONPROF_ORDER.map(abbr => certLevels.find(cl => cl.abbreviation === abbr)).filter(Boolean);
              const profCertLevels = certLevels.filter(cl => !nonprofSet.has(cl.abbreviation));

              const totalCols = 18 + Math.min(numberOfDives, 2) - (numberOfDives === 0 ? 3 : 0);
              return isLoading && manifest.length === 0 ? (
                <tr><td colSpan={totalCols} className="py-10 text-center text-slate-400">Loading divers...</td></tr>
              ) : (
                displayManifest.map((diver) => {
                  const rowChanges = pendingChanges[diver.id] || {};
                  const isModified = !!pendingChanges[diver.id] || !!pendingClientChanges[diver.client_id];

                  // --- Per-diver bracket position (using displayManifest so adjacency is correct) ---
                  const visitId = clientVisitIdMap[diver.client_id];
                  const isInGroup = !!(visitId && visitCounts[visitId] >= 2);
                  const groupMembers = isInGroup ? displayManifest.filter(d => clientVisitIdMap[d.client_id] === visitId) : [];
                  const posInGroup = isInGroup ? groupMembers.findIndex(d => d.id === diver.id) : -1;
                  const bracketIsFirst = posInGroup === 0;
                  const bracketIsLast = posInGroup === groupMembers.length - 1;
                  const bracketColor = isInGroup ? GROUP_COLORS[visitColorIndex[visitId] % GROUP_COLORS.length] : null;

                return (
                  // Added `group/row` so the delete button knows when the specific row is hovered
                  <tr key={diver.id} className={`${isModified ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'} transition-colors group/row`}>

                    {/* Group bracket column */}
                    <td className={`relative p-0 sticky left-0 z-10 ${isModified ? 'bg-amber-50' : 'bg-white'}`} style={{ width: '10px' }}>
                      {bracketColor && (
                        <div
                          className={`absolute left-1/2 -translate-x-1/2 w-[3px] ${bracketColor}`}
                          style={{
                            top: bracketIsFirst ? '50%' : '0',
                            bottom: bracketIsLast ? '50%' : '0',
                            borderRadius: bracketIsFirst ? '9999px 9999px 0 0' : bracketIsLast ? '0 0 9999px 9999px' : '0',
                          }}
                        />
                      )}
                    </td>

                    <td className={`px-3 py-2 font-bold text-slate-900 border-r sticky left-[10px] z-10 shadow-[1px_0_0_0_#e2e8f0] ${isModified ? 'bg-amber-50' : 'bg-white'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/clients?clientId=${diver.client_id}`}
                          className="hover:text-teal-600 hover:underline transition-colors"
                        >
                          {diver.clients?.first_name} {diver.clients?.last_name}
                        </Link>
                        
                        {/* Row action buttons (appear on hover) */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity focus-within:opacity-100">
                          {/* Add to another trip */}
                          <button
                            onClick={() => {
                              const vid = clientVisitIdMap[diver.client_id];
                              const companions = vid
                                ? displayManifest.filter(d => d.client_id !== diver.client_id && clientVisitIdMap[d.client_id] === vid)
                                : [];
                              setDiverAction({ diver, companions, mode: 'add' });
                            }}
                            title={`Add ${diver.clients?.first_name} to another trip`}
                            className="text-slate-300 hover:text-emerald-500 p-0.5 rounded hover:bg-emerald-50 focus:opacity-100"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                            </svg>
                          </button>
                          {/* Move to another trip */}
                          <button
                            onClick={() => {
                              const vid = clientVisitIdMap[diver.client_id];
                              const companions = vid
                                ? displayManifest.filter(d => d.client_id !== diver.client_id && clientVisitIdMap[d.client_id] === vid)
                                : [];
                              setDiverAction({ diver, companions, mode: 'move' });
                            }}
                            title={`Move ${diver.clients?.first_name} to another trip`}
                            className="text-slate-300 hover:text-teal-500 p-0.5 rounded hover:bg-teal-50 focus:opacity-100"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                          </button>
                          {/* Remove from trip */}
                          <button
                            onClick={() => handleRemoveDiver(diver)}
                            title={`Remove ${diver.clients?.first_name} from trip`}
                            className="text-slate-300 hover:text-red-500 p-0.5 rounded hover:bg-red-50 focus:opacity-100"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Admin Toggles */}
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => handleChange(diver.id, 'waiver', !(rowChanges.waiver ?? diver.waiver ?? false))} title="Toggle Waiver" className="relative mx-auto block p-0.5">
                        {!(rowChanges.waiver ?? diver.waiver) && <span style={{ animationDelay: pingDelay }} className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />}
                        <svg className={`relative w-4 h-4 transition-colors ${(rowChanges.waiver ?? diver.waiver) ? 'text-emerald-500' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => handleChange(diver.id, 'deposit', !(rowChanges.deposit ?? diver.deposit ?? false))} title="Toggle Deposit" className="relative mx-auto block p-0.5">
                        {!(rowChanges.deposit ?? diver.deposit) && <span style={{ animationDelay: pingDelay }} className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />}
                        <svg className={`relative w-4 h-4 transition-colors ${(rowChanges.deposit ?? diver.deposit) ? 'text-emerald-500' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                      </button>
                    </td>
                    <td className="px-2 py-2 border-r text-center">
                      <button onClick={() => handleChange(diver.id, 'pick_up', !(rowChanges.pick_up ?? diver.pick_up ?? false))} title="Toggle Pick Up" className="mx-auto block">
                        <svg className={`w-4 h-4 transition-colors ${(rowChanges.pick_up ?? diver.pick_up) ? 'text-emerald-500' : 'text-red-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1" /></svg>
                      </button>
                    </td>

                    {/* Last Dive */}
                    {(() => {
                      const effectiveLd = pendingClientChanges[diver.client_id]?.last_dive_date ?? diver.clients?.last_dive_date ?? '';
                      const isStale = effectiveLd
                        ? (Date.now() - new Date(effectiveLd).getTime()) > 365 * 24 * 60 * 60 * 1000
                        : false;
                      return (
                        <td className="px-3 py-2 border-r text-center font-medium">
                          <div className="relative inline-block">
                            <span className={`text-[11px] ${isStale ? 'text-amber-500' : effectiveLd ? 'text-slate-500' : 'text-amber-600'}`}>
                              {effectiveLd ? formatLastDive(effectiveLd) : 'New'}
                            </span>
                            <input
                              type="date"
                              value={effectiveLd}
                              onChange={e => handleClientChange(diver.client_id, 'last_dive_date', e.target.value || null)}
                              onKeyDown={e => e.key === 'Enter' && handleSave()}
                              title="Click to edit last dive date"
                              className="absolute inset-0 opacity-0 cursor-pointer w-full"
                            />
                          </div>
                        </td>
                      );
                    })()}

                    {/* Cert Level */}
                    <td className="px-1 py-1 border-r text-center" style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }}>
                      {diver.courses?.name
                        ? <span className="text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded text-[10px]">{diver.courses.name}</span>
                        : (
                          <select
                            value={pendingClientChanges[diver.client_id]?.cert_level ?? diver.clients?.cert_level ?? ''}
                            onChange={e => handleClientChange(diver.client_id, 'cert_level', e.target.value || null)}
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-teal-500 rounded text-[10px] font-bold text-slate-700 cursor-pointer text-center"
                          >
                            <option value="">-</option>
                            <optgroup label="Recreational">
                              {nonprofCertLevels.map((cl: any) => (
                                <option key={cl.id} value={cl.id}>{cl.abbreviation}</option>
                              ))}
                            </optgroup>
                            {profCertLevels.length > 0 && (
                              <optgroup label="Professional">
                                {profCertLevels.map((cl: any) => (
                                  <option key={cl.id} value={cl.id}>{cl.abbreviation}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        )
                      }
                    </td>

                    {/* Equipment Dropdowns */}
                    {(numberOfDives > 0 ? ['bcd', 'wetsuit', 'fins', 'mask'] : ['wetsuit', 'fins', 'mask']).map(gear => (
                      <td key={gear} className="px-1 py-1 border-r bg-teal-50/10 hover:bg-white transition-colors">
                        <select value={rowChanges[gear] ?? diver[gear] ?? ''} onChange={e => handleChange(diver.id, gear, e.target.value)} className="w-full bg-transparent border-none focus:ring-1 focus:ring-teal-500 rounded text-[10px] font-bold text-slate-700 cursor-pointer appearance-none text-center">
                          <option value="">-</option>
                          {getSizesFor(gear).map((s: string) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    ))}

                    {/* Boolean Equipment */}
                    {numberOfDives > 0 && <td className="px-2 py-2 border-r text-center">
                      <input type="checkbox" checked={rowChanges.regulator ?? diver.regulator ?? false} onChange={e => handleChange(diver.id, 'regulator', e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer" />
                    </td>}
                    {numberOfDives > 0 && <td className="px-2 py-2 border-r text-center">
                      <input type="checkbox" checked={rowChanges.computer ?? diver.computer ?? false} onChange={e => handleChange(diver.id, 'computer', e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer" />
                    </td>}

                    {/* Tank 1 Chip */}
                    {numberOfDives >= 1 && <td className="px-2 py-1 border-r text-center">
                      <TankChip
                        value={rowChanges.tank1 ?? diver.tank1}
                        onChange={v => handleChange(diver.id, 'tank1', v)}
                      />
                    </td>}

                    {/* Tank 2 Chip */}
                    {numberOfDives >= 2 && <td className="px-2 py-1 border-r text-center">
                      <TankChip
                        value={rowChanges.tank2 ?? diver.tank2}
                        onChange={v => handleChange(diver.id, 'tank2', v)}
                      />
                    </td>}

                    {/* Weights */}
                    <td className="px-2 py-1 border-r text-center">
                      <input type="text" value={rowChanges.weights ?? diver.weights ?? ''} onChange={e => handleChange(diver.id, 'weights', e.target.value === '' ? null : e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="-" className="w-12 text-[10px] font-bold text-slate-700 bg-transparent border-none focus:ring-1 focus:ring-teal-500 rounded p-0.5 text-center placeholder:text-slate-300"/>
                    </td>

                    {/* Private instructor */}
                    <td className="px-2 py-2 border-r text-center">
                      <input
                        type="checkbox"
                        checked={rowChanges.private ?? diver.private ?? false}
                        onChange={e => handleChange(diver.id, 'private', e.target.checked)}
                        title="Private instructor"
                        className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                      />
                    </td>

                    {/* Activity */}
                    <td className="px-1 py-1 border-r text-center" style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }}>
                      {diver.courses?.name
                        ? <span className="text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded text-[10px]">{diver.courses.name}</span>
                        : (
                          <select
                            value={rowChanges.activity_id ?? diver.activity_id ?? ''}
                            onChange={e => handleChange(diver.id, 'activity_id', e.target.value || null)}
                            className="w-full bg-transparent border-none focus:ring-1 focus:ring-violet-500 rounded text-[10px] font-bold text-slate-700 cursor-pointer text-center"
                          >
                            <option value="">-</option>
                            {activities.map((a: any) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        )
                      }
                    </td>

                    {/* Next Trip */}
                    <td className="px-2 py-2 border-r text-center">
                      {nextTripMap[diver.client_id] ? renderNextChip(nextTripMap[diver.client_id]) : <span className="text-[10px] text-slate-300">—</span>}
                    </td>

                    {/* Notes */}
                    <td className="px-2 py-1">
                      <input type="text" value={rowChanges.notes ?? diver.notes ?? ''} onChange={e => handleChange(diver.id, 'notes', e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="Add note..." className="w-full min-w-[150px] bg-transparent border-none focus:ring-1 focus:ring-teal-500 px-2 py-1 text-slate-500 italic placeholder:text-slate-300 rounded"/>
                    </td>
                  </tr>
                );
                })
              );
            })()}

            {/* Empty slots up to vessel capacity */}
            {capacity && !isLoading && (() => {
              const emptySlots = Math.max(0, capacity - manifest.length);
              return Array.from({ length: emptySlots }).map((_, i) => (
                <tr key={`empty-${i}`} className="hover:bg-slate-50/50 transition-colors group/empty">
                  <td className="p-0 sticky left-0 z-10 bg-white" style={{ width: '10px' }} />
                  <td className="px-3 py-2 border-r sticky left-[10px] bg-white z-10 shadow-[1px_0_0_0_#e2e8f0]">
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="flex items-center gap-1.5 text-slate-300 hover:text-teal-600 transition-colors opacity-0 group-hover/empty:opacity-100 focus:opacity-100 text-[11px] font-semibold"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Diver
                    </button>
                  </td>
                  {Array.from({ length: 16 + Math.min(numberOfDives, 2) - (numberOfDives === 0 ? 3 : 0) }).map((_, j) => (
                    <td key={j} className="px-2 py-2">
                      <span className="block h-[18px]" />
                    </td>
                  ))}
                </tr>
              ));
            })()}
            {/* Filler row — stretches to fill remaining container height */}
            <tr className="h-full"><td colSpan={18 + Math.min(numberOfDives, 2) - (numberOfDives === 0 ? 3 : 0)} /></tr>
          </tbody>
        </table>
      </div>
      <AddDiverModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        tripId={tripId}
        tripDate={tripDate}
        onSuccess={() => {
          fetchData();
          setIsAddModalOpen(false);
          if (onManifestChange) onManifestChange();
        }}
      />
      <MoveClientModal
        isOpen={!!diverAction}
        onClose={() => setDiverAction(null)}
        diver={diverAction?.diver}
        companions={diverAction?.companions}
        mode={diverAction?.mode}
        currentTripId={tripId}
        currentTripDate={tripDate}
        onSuccess={(targetTrip) => {
          if (diverAction?.mode === 'move') {
            // Clear pending changes only for moved members (they leave this trip)
            const movedTripClientIds = [diverAction.diver.id, ...(diverAction.companions.map((c: any) => c.id))];
            const movedClientIds = [diverAction.diver.client_id, ...(diverAction.companions.map((c: any) => c.client_id))];
            setPendingChanges(prev => {
              const next = { ...prev };
              movedTripClientIds.forEach(id => { delete next[id]; });
              return next;
            });
            setPendingClientChanges(prev => {
              const next = { ...prev };
              movedClientIds.forEach(id => { delete next[id]; });
              return next;
            });
          }
          setDiverAction(null);
          fetchData();
          if (onManifestChange) onManifestChange();
          // Navigate to the target trip after both move and add
          if (onMovedToTrip) onMovedToTrip(targetTrip);
        }}
      />
    </div>
  );
}