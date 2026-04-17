'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { getTodayStr, localDateStr } from './dateUtils';

interface BulkAddPanelProps {
  userOrgId: string | null;
  trips: any[];
  selectedTripIds: string[];
  onTripToggle: (tripId: string) => void;
  onClearTrips: () => void;
  onWindowStartChange: (date: string) => void;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BulkAddPanel({
  userOrgId,
  trips,
  selectedTripIds,
  onTripToggle,
  onClearTrips,
  onWindowStartChange,
  onClose,
  onSuccess,
}: BulkAddPanelProps) {
  const supabase = createClient();

  // --- Client search ---
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching]     = useState(false);
  const [showDropdown, setShowDropdown]   = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // --- Primary client ---
  const [primaryClient, setPrimaryClient] = useState<any | null>(null);

  // --- Visits ---
  const [visits, setVisits]               = useState<any[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);

  // --- Companions ---
  const [companions, setCompanions]               = useState<any[]>([]);
  const [selectedCompanionIds, setSelectedCompanionIds] = useState<Set<string>>(new Set());

  // --- Save state ---
  const [isSaving, setIsSaving]         = useState(false);
  const [saveResults, setSaveResults]   = useState<{ tripId: string; success: boolean; alreadyExists: boolean; requiresVisit?: boolean }[] | null>(null);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Search clients
  useEffect(() => {
    if (searchQuery.trim().length < 2 || !userOrgId) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, email')
        .eq('organization_id', userOrgId)
        .or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(8);
      setSearchResults(data || []);
      setIsSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, userOrgId, supabase]);

  // Load visits when primary client changes
  useEffect(() => {
    if (!primaryClient) return;
    async function loadVisits() {
      const { data } = await supabase
        .from('visits')
        .select(`id, start_date, end_date, hotels ( name ), visit_clients!inner ( client_id )`)
        .eq('visit_clients.client_id', primaryClient.id)
        .gte('end_date', getTodayStr())
        .order('start_date', { ascending: true });

      const v = data || [];
      setVisits(v);

      if (v.length === 1) {
        await applyVisit(v[0]);
      } else {
        setSelectedVisitId(null);
        setCompanions([]);
        setSelectedCompanionIds(new Set());
      }
    }
    loadVisits();
  }, [primaryClient]);

  const applyVisit = async (visit: any) => {
    setSelectedVisitId(visit.id);
    onWindowStartChange(visit.start_date);

    const { data } = await supabase
      .from('visit_clients')
      .select(`client_id, clients ( id, first_name, last_name )`)
      .eq('visit_id', visit.id)
      .neq('client_id', primaryClient!.id);

    const comps = (data || []).map((r: any) => r.clients).filter(Boolean);
    setCompanions(comps);
    setSelectedCompanionIds(new Set(comps.map((c: any) => c.id)));
  };

  const handleSelectClient = (client: any) => {
    setPrimaryClient(client);
    setSearchQuery('');
    setShowDropdown(false);
    setVisits([]);
    setSelectedVisitId(null);
    setCompanions([]);
    setSelectedCompanionIds(new Set());
    setSaveResults(null);
    onClearTrips();
  };

  const clearClient = () => {
    setPrimaryClient(null);
    setVisits([]);
    setSelectedVisitId(null);
    setCompanions([]);
    setSelectedCompanionIds(new Set());
    setSaveResults(null);
    onClearTrips();
  };

  const toggleCompanion = (id: string) => {
    setSelectedCompanionIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allClientIds = primaryClient
    ? [primaryClient.id, ...Array.from(selectedCompanionIds)]
    : [];

  const handleConfirm = async () => {
    if (allClientIds.length === 0 || selectedTripIds.length === 0) return;
    setIsSaving(true);
    setSaveResults(null);

    const results = await Promise.all(
      selectedTripIds.map(async (tripId) => {
        const trip     = trips.find(t => t.id === tripId);
        const tripDate = trip ? localDateStr(trip.start_time) : getTodayStr();

        const { error } = await supabase.rpc('add_clients_to_trip', {
          p_trip_id:    tripId,
          p_client_ids: allClientIds,
          p_trip_date:  tripDate,
        });
        return { tripId, success: !error, alreadyExists: error?.code === '23505', requiresVisit: error?.code === '23001' };
      })
    );

    setSaveResults(results);
    setIsSaving(false);

    const anyAdded = results.some(r => r.success);
    if (anyAdded) onSuccess();
    if (!results.some(r => r.requiresVisit)) onClearTrips();
  };

  const canConfirm = allClientIds.length > 0 && selectedTripIds.length > 0 && !isSaving;

  return (
    <div className="w-72 shrink-0 bg-white border-l border-slate-200 flex flex-col h-full">

      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-slate-800">Add to Trips</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">

        {/* ── 1. Diver ── */}
        <div className="p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Diver</p>

          {primaryClient ? (
            <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-teal-800 truncate">{primaryClient.first_name} {primaryClient.last_name}</p>
                {primaryClient.email && <p className="text-xs text-teal-600 truncate">{primaryClient.email}</p>}
              </div>
              <button onClick={clearClient} className="text-teal-400 hover:text-teal-700 ml-2 shrink-0 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="relative" ref={searchRef}>
              <input
                type="text"
                placeholder="Search diver…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setShowDropdown(e.target.value.trim().length >= 2); }}
                onFocus={() => searchQuery.trim().length >= 2 && setShowDropdown(true)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              {showDropdown && (
                <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
                  {isSearching ? (
                    <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-400">No results.</div>
                  ) : (
                    <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                      {searchResults.map(c => (
                        <li key={c.id}>
                          <button
                            onClick={() => handleSelectClient(c)}
                            className="w-full text-left px-3 py-2 hover:bg-teal-50 transition-colors"
                          >
                            <p className="text-sm font-medium text-slate-800">{c.first_name} {c.last_name}</p>
                            {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 2. Visit & Companions ── */}
        {primaryClient && (
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Visit & Companions</p>

            {visits.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No current or upcoming visits found.</p>
            ) : visits.length > 1 ? (
              <select
                value={selectedVisitId || ''}
                onChange={e => { const v = visits.find(v => v.id === e.target.value); if (v) applyVisit(v); }}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 mb-3"
              >
                <option value="">Select a visit…</option>
                {visits.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.start_date} → {v.end_date}{v.hotels?.name ? ` · ${v.hotels.name}` : ''}
                  </option>
                ))}
              </select>
            ) : null}

            {companions.length > 0 ? (
              <div className="space-y-2">
                {companions.map(c => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedCompanionIds.has(c.id)}
                      onChange={() => toggleCompanion(c.id)}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900">
                      {c.first_name} {c.last_name}
                    </span>
                  </label>
                ))}
              </div>
            ) : selectedVisitId ? (
              <p className="text-xs text-slate-400 italic">No other clients on this visit.</p>
            ) : null}
          </div>
        )}

        {/* ── 3. Trips ── */}
        {primaryClient && (
          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Trips</p>
            {selectedTripIds.length === 0 ? (
              <p className="text-xs text-slate-500">Click trips on the board to select them.</p>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal-700">
                  {selectedTripIds.length} trip{selectedTripIds.length !== 1 ? 's' : ''} selected
                </p>
                <button onClick={onClearTrips} className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── 4. Save results ── */}
        {saveResults && (
          <div className="p-4 space-y-2">
            {saveResults.some(r => r.success) && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-green-700">
                  ✓ Added to {saveResults.filter(r => r.success).length} trip{saveResults.filter(r => r.success).length !== 1 ? 's' : ''}
                  {saveResults.some(r => r.alreadyExists) ? ` · ${saveResults.filter(r => r.alreadyExists).length} already on trip` : ''}
                </p>
              </div>
            )}
            {saveResults.some(r => r.requiresVisit) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-700">Client has no active visit for this date. Create a visit first or mark them as a local resident.</p>
              </div>
            )}
            {saveResults.some(r => !r.success && !r.alreadyExists && !r.requiresVisit) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-700">
                  {saveResults.filter(r => !r.success && !r.requiresVisit).length} trip{saveResults.filter(r => !r.success && !r.requiresVisit).length !== 1 ? 's' : ''} failed to update.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100 shrink-0">
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed bg-teal-600 hover:bg-teal-700 text-white"
        >
          {isSaving
            ? 'Adding…'
            : canConfirm
            ? `Confirm · ${selectedTripIds.length} trip${selectedTripIds.length !== 1 ? 's' : ''}`
            : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
