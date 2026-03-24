'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

// ── DivesiteCombobox ──────────────────────────────────────────────────────────

interface DivesiteComboboxProps {
  divesites: { id: string; name: string }[];
  value: string;           // currently selected divesite id
  onChange: (id: string) => void;
}

function DivesiteCombobox({ divesites, value, onChange }: DivesiteComboboxProps) {
  const selected   = divesites.find(s => s.id === value);
  const [query, setQuery]       = useState(selected?.name ?? '');
  const [open, setOpen]         = useState(false);
  const [focused, setFocused]   = useState(-1);
  const containerRef            = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);
  const listRef                 = useRef<HTMLUListElement>(null);

  // Keep text in sync when the parent resets the value
  useEffect(() => {
    setQuery(divesites.find(s => s.id === value)?.name ?? '');
  }, [value, divesites]);

  const filtered = query.trim() === ''
    ? divesites
    : divesites.filter(s => s.name.toLowerCase().includes(query.toLowerCase()));

  const commit = (site: { id: string; name: string }) => {
    onChange(site.id);
    setQuery(site.name);
    setOpen(false);
    setFocused(-1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setFocused(-1);
    if (e.target.value === '') onChange('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocused(f => Math.min(f + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocused(f => Math.max(f - 1, 0));
    } else if (e.key === 'Enter' && focused >= 0 && filtered[focused]) {
      e.preventDefault();
      commit(filtered[focused]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setFocused(-1);
    }
  };

  // Scroll focused item into view
  useEffect(() => {
    if (focused >= 0 && listRef.current) {
      const item = listRef.current.children[focused] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [focused]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // If nothing valid selected, restore last committed name
        setQuery(divesites.find(s => s.id === value)?.name ?? '');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value, divesites]);

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Search dive site…"
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
        autoComplete="off"
      />
      {/* Clear button */}
      {query && (
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onChange(''); setQuery(''); setOpen(true); inputRef.current?.focus(); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
          tabIndex={-1}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1"
        >
          {filtered.map((site, idx) => (
            <li
              key={site.id}
              onMouseDown={e => { e.preventDefault(); commit(site); }}
              className={`px-3 py-2 text-sm cursor-pointer ${
                idx === focused
                  ? 'bg-teal-50 text-teal-700 font-medium'
                  : site.id === value
                    ? 'bg-slate-50 text-slate-700'
                    : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {site.name}
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && query.trim() !== '' && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm text-slate-400 italic">
          No sites match "{query}"
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  trip: any;
  onSaved?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PostTripLog({ trip, onSaved }: Props) {
  const supabase = createClient();
  const numberOfDives: number = trip.trip_types?.number_of_dives ?? 1;

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
        const presentSet = new Set((existing.staff_dive_logs ?? []).map((sl: any) => sl.trip_staff_id));
        for (const s of staffList) {
          staffPresence[s.tripStaffId] = presentSet.has(s.tripStaffId);
        }
      } else {
        for (const s of staffList) staffPresence[s.tripStaffId] = true;
      }

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

        const hasAnything =
          dive.divesiteId ||
          Object.values(dive.clientLogs).some(v => v.maxDepth !== '' || v.bottomTime !== '') ||
          Object.values(dive.staffPresence).some(Boolean);
        if (!hasAnything) continue;

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

  if (!dives.length) return null;

  const multiDive = numberOfDives > 1;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* ── Dive site + time rows ─────────────────────────────────────────── */}
      <div className="shrink-0 space-y-2 mb-6">
        {dives.map((dive, i) => (
          <div key={i} className="flex items-center gap-3">
            {multiDive && (
              <span className="inline-flex items-center justify-center w-16 shrink-0 px-2 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
                Dive {i + 1}
              </span>
            )}
            {!multiDive && (
              <label className="text-sm font-semibold text-slate-500 shrink-0 w-10">Site</label>
            )}
            <DivesiteCombobox
              divesites={divesites}
              value={dive.divesiteId}
              onChange={val => setDives(prev => {
                const next = [...prev];
                next[i] = { ...next[i], divesiteId: val };
                return next;
              })}
            />
            <label className="text-sm font-semibold text-slate-500 shrink-0">Time</label>
            <input
              type="time"
              value={dive.startedAt}
              onChange={e => {
                const val = e.target.value;
                setDives(prev => {
                  const next = [...prev];
                  next[i] = { ...next[i], startedAt: val };
                  return next;
                });
              }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        ))}
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-5">

        {/* ── Clients table ──────────────────────────────────────────────── */}
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
            Clients
            <span className="ml-1 font-normal normal-case">— depth (m) · time (min)</span>
          </h3>
          <div className="border border-slate-200 rounded-lg overflow-hidden">

            {/* Column headers (dive labels) — only shown for multi-dive */}
            {multiDive && (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
                <span className="flex-1" />
                {dives.map((_, i) => (
                  <div key={i} className="flex gap-1">
                    <span className="w-20 text-center text-xs font-bold text-teal-600 uppercase tracking-wide">
                      D{i + 1} depth
                    </span>
                    <span className="w-20 text-center text-xs font-bold text-teal-600 uppercase tracking-wide">
                      D{i + 1} time
                    </span>
                  </div>
                ))}
                {/* spacer for the per-dive apply buttons column */}
                <span className="w-8" />
              </div>
            )}

            {/* Column sub-headers (depth / time) — single-dive only */}
            {!multiDive && (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
                <span className="flex-1" />
                <span className="w-20 text-center text-xs font-bold text-slate-400 uppercase tracking-wide">Depth</span>
                <span className="w-20 text-center text-xs font-bold text-slate-400 uppercase tracking-wide">Time</span>
                <span className="w-8" />
              </div>
            )}

            {/* Fill-all row */}
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-slate-200">
              <span className="flex-1 text-xs font-bold text-slate-400 uppercase tracking-wide">Fill all</span>
              {dives.map((_, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="—"
                    value={fillAll[i].maxDepth}
                    onChange={e => setFillAll(prev => {
                      const next = [...prev];
                      next[i] = { ...next[i], maxDepth: e.target.value };
                      return next;
                    })}
                    className="w-20 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="—"
                    value={fillAll[i].bottomTime}
                    onChange={e => setFillAll(prev => {
                      const next = [...prev];
                      next[i] = { ...next[i], bottomTime: e.target.value };
                      return next;
                    })}
                    className="w-20 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                </div>
              ))}
              <button
                onClick={() => dives.forEach((_, i) => applyFillAll(i))}
                className="w-8 flex items-center justify-center py-1 text-xs font-semibold bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
                title="Apply to all clients"
              >
                ↓
              </button>
            </div>

            {/* Client rows */}
            {clients.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400 italic">No clients on this trip</p>
            ) : (
              clients.map(c => (
                <div
                  key={c.tripClientId}
                  className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-100 last:border-0"
                >
                  <span className="flex-1 text-sm text-slate-700 font-medium truncate">{c.name}</span>
                  {dives.map((dive, i) => {
                    const log = dive.clientLogs[c.tripClientId] ?? { maxDepth: '', bottomTime: '' };
                    return (
                      <div key={i} className="flex gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="—"
                          value={log.maxDepth}
                          onChange={e => updateClientLog(i, c.tripClientId, 'maxDepth', e.target.value)}
                          className="w-20 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                        <input
                          type="number"
                          min="0"
                          placeholder="—"
                          value={log.bottomTime}
                          onChange={e => updateClientLog(i, c.tripClientId, 'bottomTime', e.target.value)}
                          className="w-20 border border-slate-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    );
                  })}
                  {/* spacer to align with apply button column */}
                  <span className="w-8" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Staff table ────────────────────────────────────────────────── */}
        {staff.length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Staff</h3>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-100">
                <span className="flex-1 text-xs font-bold text-slate-400 uppercase tracking-wide">Name</span>
                {dives.map((_, i) => (
                  <span
                    key={i}
                    className="w-16 text-center text-xs font-bold text-teal-600 uppercase tracking-wide"
                  >
                    {multiDive ? `Dive ${i + 1}` : 'Present'}
                  </span>
                ))}
              </div>
              {staff.map(s => (
                <div
                  key={s.tripStaffId}
                  className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-100 last:border-0"
                >
                  <span className="flex-1 text-sm text-slate-700 font-medium">{s.name}</span>
                  {s.initials && (
                    <span className="text-xs text-slate-400 font-mono tabular-nums">{s.initials}</span>
                  )}
                  {dives.map((dive, i) => (
                    <div key={i} className="w-16 flex justify-center">
                      <input
                        type="checkbox"
                        checked={!!dive.staffPresence[s.tripStaffId]}
                        onChange={() => toggleStaff(i, s.tripStaffId)}
                        className="w-4 h-4 rounded text-teal-600 accent-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Save bar ──────────────────────────────────────────────────────── */}
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
