'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientEntry {
  tripClientId: string;
  name: string;
}

interface StaffEntry {
  tripStaffId: string;   // trip_staff.id — the FK used in staff_dive_logs
  name: string;
  initials: string;
}

interface DiveState {
  tripDiveId: string | null;   // null = not yet saved
  divesiteId: string;
  startedAt: string;           // HH:MM local time
  clientLogs: Record<string, { maxDepth: string; bottomTime: string }>;
  staffPresence: Record<string, boolean>;  // keyed by tripStaffId
}

// ── Time helpers ──────────────────────────────────────────────────────────────

/** Default start time for dive slot i (0-indexed): trip start + 30min + i×2h */
function defaultDiveTime(tripStartTime: string, diveIndex: number): string {
  const d = new Date(tripStartTime);
  d.setMinutes(d.getMinutes() + 30 + diveIndex * 120);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Build a full ISO timestamp from the trip's date and an HH:MM string. */
function buildTimestamp(tripStartTime: string, timeStr: string): string | null {
  if (!timeStr) return null;
  const [hh, mm] = timeStr.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;
  const d = new Date(tripStartTime);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

interface Props {
  trip: any;
  onSaved?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PostTripLog({ trip, onSaved }: Props) {
  const supabase = createClient();
  const numberOfDives: number = trip.trip_types?.number_of_dives ?? 1;

  const [activeTab, setActiveTab]   = useState(0);
  const [dives, setDives]           = useState<DiveState[]>([]);
  const [clients, setClients]       = useState<ClientEntry[]>([]);
  const [staff, setStaff]           = useState<StaffEntry[]>([]);
  const [divesites, setDivesites]   = useState<{ id: string; name: string }[]>([]);
  const [fillAll, setFillAll]       = useState<{ maxDepth: string; bottomTime: string }[]>(
    Array.from({ length: numberOfDives }, () => ({ maxDepth: '', bottomTime: '' }))
  );
  const [isSaving, setIsSaving]     = useState(false);
  const [isLoading, setIsLoading]   = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setIsLoading(true);

    const [
      { data: tcData },
      { data: tsData },
      { data: sitesData },
      { data: divesData },
    ] = await Promise.all([
      supabase
        .from('trip_clients')
        .select('id, clients ( id, first_name, last_name )')
        .eq('trip_id', trip.id),
      supabase
        .from('trip_staff')
        .select('id, staff ( id, first_name, last_name, initials )')
        .eq('trip_id', trip.id),
      supabase
        .from('divesites')
        .select('id, name')
        .order('name'),
      supabase
        .from('trip_dives')
        .select(`
          id, dive_number, divesite_id, started_at,
          client_dive_logs ( trip_client_id, max_depth, bottom_time ),
          staff_dive_logs ( trip_staff_id )
        `)
        .eq('trip_id', trip.id),
    ]);

    // Build clients list
    const clientsList: ClientEntry[] = (tcData ?? []).map((tc: any) => ({
      tripClientId: tc.id,
      name: `${tc.clients?.first_name ?? ''} ${tc.clients?.last_name ?? ''}`.trim() || 'Unknown',
    }));
    setClients(clientsList);

    // Build staff list — deduplicate by staff_id, keep first trip_staff row
    const seenStaff = new Set<string>();
    const staffList: StaffEntry[] = (tsData ?? []).reduce((acc: StaffEntry[], ts: any) => {
      if (!ts.staff || seenStaff.has(ts.staff.id)) return acc;
      seenStaff.add(ts.staff.id);
      acc.push({
        tripStaffId: ts.id,
        name: `${ts.staff.first_name ?? ''} ${ts.staff.last_name ?? ''}`.trim() || 'Unknown',
        initials: ts.staff.initials ?? '',
      });
      return acc;
    }, []);
    setStaff(staffList);

    setDivesites(sitesData ?? []);

    // Index existing trip_dives by dive_number
    const diveMap: Record<number, any> = {};
    for (const d of divesData ?? []) diveMap[d.dive_number] = d;

    // Build initial state for each dive slot
    const initialDives: DiveState[] = Array.from({ length: numberOfDives }, (_, i) => {
      const existing = diveMap[i + 1];
      const clientLogs: Record<string, { maxDepth: string; bottomTime: string }> = {};
      const staffPresence: Record<string, boolean> = {};

      if (existing) {
        for (const cl of existing.client_dive_logs ?? []) {
          clientLogs[cl.trip_client_id] = {
            maxDepth: cl.max_depth != null ? String(cl.max_depth) : '',
            bottomTime: cl.bottom_time != null ? String(cl.bottom_time) : '',
          };
        }
        // Only mark as present if they have an existing log entry
        const presentSet = new Set((existing.staff_dive_logs ?? []).map((sl: any) => sl.trip_staff_id));
        for (const s of staffList) {
          staffPresence[s.tripStaffId] = presentSet.has(s.tripStaffId);
        }
      } else {
        // New dive — default all staff to present
        for (const s of staffList) staffPresence[s.tripStaffId] = true;
      }

      // started_at: use existing value if present, otherwise compute default
      let startedAt = defaultDiveTime(trip.start_time, i);
      if (existing?.started_at) {
        const d = new Date(existing.started_at);
        startedAt = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }

      return {
        tripDiveId: existing?.id ?? null,
        divesiteId: existing?.divesite_id ?? '',
        startedAt,
        clientLogs,
        staffPresence,
      };
    });

    setDives(initialDives);
    setIsLoading(false);
  }, [trip.id, supabase, numberOfDives]);

  useEffect(() => { load(); }, [load]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const updateClientLog = (
    diveIdx: number,
    tripClientId: string,
    field: 'maxDepth' | 'bottomTime',
    value: string
  ) => {
    setDives(prev => {
      const next = [...prev];
      next[diveIdx] = {
        ...next[diveIdx],
        clientLogs: {
          ...next[diveIdx].clientLogs,
          [tripClientId]: {
            maxDepth: next[diveIdx].clientLogs[tripClientId]?.maxDepth ?? '',
            bottomTime: next[diveIdx].clientLogs[tripClientId]?.bottomTime ?? '',
            [field]: value,
          },
        },
      };
      return next;
    });
  };

  const applyFillAll = (diveIdx: number) => {
    const { maxDepth, bottomTime } = fillAll[diveIdx];
    if (!maxDepth && !bottomTime) return;
    setDives(prev => {
      const next = [...prev];
      const newLogs = { ...next[diveIdx].clientLogs };
      for (const c of clients) {
        newLogs[c.tripClientId] = {
          maxDepth: maxDepth || newLogs[c.tripClientId]?.maxDepth || '',
          bottomTime: bottomTime || newLogs[c.tripClientId]?.bottomTime || '',
        };
      }
      next[diveIdx] = { ...next[diveIdx], clientLogs: newLogs };
      return next;
    });
  };

  const toggleStaff = (diveIdx: number, tripStaffId: string) => {
    setDives(prev => {
      const next = [...prev];
      next[diveIdx] = {
        ...next[diveIdx],
        staffPresence: {
          ...next[diveIdx].staffPresence,
          [tripStaffId]: !next[diveIdx].staffPresence[tripStaffId],
        },
      };
      return next;
    });
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      for (let i = 0; i < dives.length; i++) {
        const dive = dives[i];

        // Skip dive slots with no site and no client data and no staff — nothing to save
        const hasAnything =
          dive.divesiteId ||
          Object.values(dive.clientLogs).some(v => v.maxDepth !== '' || v.bottomTime !== '') ||
          Object.values(dive.staffPresence).some(Boolean);
        if (!hasAnything) continue;

        // 1. Upsert trip_dive row
        const { data: tdData, error: tdError } = await supabase
          .from('trip_dives')
          .upsert(
            {
              ...(dive.tripDiveId ? { id: dive.tripDiveId } : {}),
              trip_id: trip.id,
              dive_number: i + 1,
              divesite_id: dive.divesiteId || null,
              started_at: buildTimestamp(trip.start_time, dive.startedAt),
            },
            { onConflict: 'trip_id,dive_number' }
          )
          .select('id')
          .single();

        if (tdError) throw tdError;
        const tripDiveId = tdData.id;

        // 2. Replace client logs — insert a row for every client on the trip,
        //    metrics may be null (client was on boat but sat out / no data recorded).
        await supabase.from('client_dive_logs').delete().eq('trip_dive_id', tripDiveId);
        const clientRows = clients.map(c => ({
          trip_dive_id:   tripDiveId,
          trip_client_id: c.tripClientId,
          max_depth:   dive.clientLogs[c.tripClientId]?.maxDepth   !== '' && dive.clientLogs[c.tripClientId]?.maxDepth   != null
            ? parseFloat(dive.clientLogs[c.tripClientId].maxDepth)   : null,
          bottom_time: dive.clientLogs[c.tripClientId]?.bottomTime !== '' && dive.clientLogs[c.tripClientId]?.bottomTime != null
            ? parseInt(dive.clientLogs[c.tripClientId].bottomTime)   : null,
        }));
        if (clientRows.length > 0) {
          const { error: clError } = await supabase.from('client_dive_logs').insert(clientRows);
          if (clError) throw clError;
        }

        // 3. Replace staff presence
        await supabase.from('staff_dive_logs').delete().eq('trip_dive_id', tripDiveId);
        const staffRows = Object.entries(dive.staffPresence)
          .filter(([, present]) => present)
          .map(([tripStaffId]) => ({
            trip_dive_id:  tripDiveId,
            trip_staff_id: tripStaffId,
          }));
        if (staffRows.length > 0) {
          const { error: slError } = await supabase.from('staff_dive_logs').insert(staffRows);
          if (slError) throw slError;
        }

        // Update local state with the resolved trip_dive_id
        setDives(prev => {
          const next = [...prev];
          next[i] = { ...next[i], tripDiveId };
          return next;
        });
      }

      setSaveSuccess(true);
      onSaved?.();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Error saving dive log: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <span className="text-sm text-slate-400 animate-pulse">Loading dive data…</span>
      </div>
    );
  }

  const currentDive = dives[activeTab];
  if (!currentDive) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* ── Dive tabs ───────────────────────────────────────────────────────── */}
      {numberOfDives > 1 && (
        <div className="flex gap-1 shrink-0 mb-5">
          {Array.from({ length: numberOfDives }, (_, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-5 py-2 text-sm font-semibold rounded-full transition-colors ${
                activeTab === i
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }`}
            >
              Dive {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* ── Scrollable content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-5">

        {/* Site + Time row */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-slate-500 shrink-0 w-10">Site</label>
          <select
            value={currentDive.divesiteId}
            onChange={e => {
              const val = e.target.value;
              setDives(prev => {
                const next = [...prev];
                next[activeTab] = { ...next[activeTab], divesiteId: val };
                return next;
              });
            }}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="">— Select dive site —</option>
            {divesites.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <label className="text-sm font-semibold text-slate-500 shrink-0">Time</label>
          <input
            type="time"
            value={currentDive.startedAt}
            onChange={e => {
              const val = e.target.value;
              setDives(prev => {
                const next = [...prev];
                next[activeTab] = { ...next[activeTab], startedAt: val };
                return next;
              });
            }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Fill all */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide shrink-0">Fill all</span>
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="Depth (m)"
            value={fillAll[activeTab].maxDepth}
            onChange={e => setFillAll(prev => {
              const next = [...prev];
              next[activeTab] = { ...next[activeTab], maxDepth: e.target.value };
              return next;
            })}
            className="w-28 border border-slate-200 rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          />
          <input
            type="number"
            min="0"
            placeholder="Time (min)"
            value={fillAll[activeTab].bottomTime}
            onChange={e => setFillAll(prev => {
              const next = [...prev];
              next[activeTab] = { ...next[activeTab], bottomTime: e.target.value };
              return next;
            })}
            className="w-28 border border-slate-200 rounded-md px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          />
          <button
            onClick={() => applyFillAll(activeTab)}
            className="ml-auto px-3 py-1.5 text-xs font-semibold bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
          >
            Apply
          </button>
        </div>

        {/* Clients */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
            Clients
            <span className="ml-1 font-normal normal-case">— depth (m) · time (min)</span>
          </h3>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {clients.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400 italic">No clients on this trip</p>
            ) : (
              clients.map(c => {
                const log = currentDive.clientLogs[c.tripClientId] ?? { maxDepth: '', bottomTime: '' };
                return (
                  <div key={c.tripClientId} className="flex items-center gap-3 px-4 py-2 bg-white">
                    <span className="flex-1 text-sm text-slate-700 font-medium truncate">{c.name}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="—"
                      value={log.maxDepth}
                      onChange={e => updateClientLog(activeTab, c.tripClientId, 'maxDepth', e.target.value)}
                      className="w-20 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="—"
                      value={log.bottomTime}
                      onChange={e => updateClientLog(activeTab, c.tripClientId, 'bottomTime', e.target.value)}
                      className="w-20 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Staff */}
        {staff.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Staff</h3>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {staff.map(s => (
                <label
                  key={s.tripStaffId}
                  className="flex items-center gap-3 px-4 py-2.5 bg-white cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={!!currentDive.staffPresence[s.tripStaffId]}
                    onChange={() => toggleStaff(activeTab, s.tripStaffId)}
                    className="w-4 h-4 rounded text-teal-600 accent-teal-600 focus:ring-teal-500"
                  />
                  <span className="flex-1 text-sm text-slate-700 font-medium">{s.name}</span>
                  {s.initials && (
                    <span className="text-xs text-slate-400 font-mono tabular-nums">{s.initials}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Save bar ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-200 pt-4 mt-5 flex items-center justify-end gap-3">
        {saveSuccess && (
          <span className="text-sm text-teal-600 font-medium animate-fade-in">
            ✓ Saved
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
        >
          {isSaving ? 'Saving…' : 'Save dive log'}
        </button>
      </div>

    </div>
  );
}
