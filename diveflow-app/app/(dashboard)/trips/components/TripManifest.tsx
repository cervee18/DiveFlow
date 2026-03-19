'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import AddDiverModal from './AddDiverModal';
import MoveClientModal from './MoveClientModal';

export default function TripManifest({
  tripId,
  tripDate,
  capacity,
  onManifestChange,
  onMovedToTrip,
}: {
  tripId: string,
  tripDate: string,
  capacity?: number,
  onManifestChange?: () => void,
  onMovedToTrip?: (trip: any) => void,
}) {
  const supabase = createClient();
  const [manifest, setManifest] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [diverAction, setDiverAction] = useState<{ diver: any; companions: any[]; mode: 'move' | 'add' } | null>(null);
  
  const [pendingChanges, setPendingChanges] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [nextTripMap, setNextTripMap] = useState<Record<string, string>>({});
  const [clientVisitIdMap, setClientVisitIdMap] = useState<Record<string, string>>({});

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
          certification_levels!cert_level ( abbreviation )
        ),
        courses ( name )
      `)
      .eq('trip_id', tripId)
      .order('id', { ascending: true });

    if (manifestError) {
      console.error("Error fetching manifest:", manifestError);
    }

    const { data: catData } = await supabase
      .from('equipment_categories')
      .select('name, sizes');

    if (manifestData) setManifest(manifestData);
    if (catData) setCategories(catData);

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
  }, [tripId, tripDate, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleChange = (id: string, field: string, value: any) => {
    setPendingChanges(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value }
    }));
  };

  const handleSave = async () => {
    if (Object.keys(pendingChanges).length === 0) return;
    setIsSaving(true);
    
    const promises = Object.entries(pendingChanges).map(([id, changes]) => 
      supabase.from('trip_clients').update(changes).eq('id', id)
    );

    const results = await Promise.all(promises);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      alert("Error saving some changes. Check the console.");
      console.error(errors);
    } else {
      setPendingChanges({});
      await fetchData(); 
    }
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
        </div>
        
        <div className="flex items-center gap-3">
          {Object.keys(pendingChanges).length > 0 && (
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
              <th className="px-3 py-3 text-center border-r">Cert</th>
              <th className="px-3 py-3 text-center border-r">Next</th>
              <th className="px-2 py-3 text-center border-r bg-teal-50/30">BCD</th>
              <th className="px-2 py-3 text-center border-r bg-teal-50/30">Suit</th>
              <th className="px-2 py-3 text-center border-r bg-teal-50/30">Fins</th>
              <th className="px-2 py-3 text-center border-r bg-teal-50/30">Mask</th>
              <th className="px-2 py-3 text-center border-r">Reg</th>
              <th className="px-2 py-3 text-center border-r">Comp</th>
              <th className="px-2 py-3 text-center border-r">T1</th>
              <th className="px-2 py-3 text-center border-r">T2</th>
              <th className="px-2 py-3 text-center border-r">Wei.</th>
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

              return isLoading && manifest.length === 0 ? (
                <tr><td colSpan={18} className="py-10 text-center text-slate-400">Loading divers...</td></tr>
              ) : (
                displayManifest.map((diver) => {
                  const rowChanges = pendingChanges[diver.id] || {};
                  const isModified = !!pendingChanges[diver.id];

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

                    {/* Last Dive & Cert */}
                    <td className="px-3 py-2 border-r text-center font-medium">
                      {diver.clients?.last_dive_date ? (() => {
                        const isStale = (Date.now() - new Date(diver.clients.last_dive_date).getTime()) > 365 * 24 * 60 * 60 * 1000;
                        return <span className={isStale ? 'text-amber-500' : 'text-slate-500'}>{formatLastDive(diver.clients.last_dive_date)}</span>;
                      })() : <span className="text-amber-600">New</span>}
                    </td>
                    <td className="px-3 py-2 border-r text-center font-bold text-slate-700">
                      {diver.courses?.name ? <span className="text-teal-700 bg-teal-100 px-1.5 py-0.5 rounded text-[10px]">{diver.courses.name}</span> : (diver.clients?.certification_levels?.abbreviation || 'OW')}
                    </td>

                    {/* Next Trip */}
                    <td className="px-2 py-2 border-r text-center">
                      {nextTripMap[diver.client_id] ? renderNextChip(nextTripMap[diver.client_id]) : <span className="text-[10px] text-slate-300">—</span>}
                    </td>

                    {/* Equipment Dropdowns */}
                    {['bcd', 'wetsuit', 'fins', 'mask'].map(gear => (
                      <td key={gear} className="px-1 py-1 border-r bg-teal-50/10 hover:bg-white transition-colors">
                        <select value={rowChanges[gear] ?? diver[gear] ?? ''} onChange={e => handleChange(diver.id, gear, e.target.value)} className="w-full bg-transparent border-none focus:ring-1 focus:ring-teal-500 rounded text-[10px] font-bold text-slate-700 cursor-pointer appearance-none text-center">
                          <option value="">-</option>
                          {getSizesFor(gear).map((s: string) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    ))}

                    {/* Boolean Equipment */}
                    <td className="px-2 py-2 border-r text-center">
                      <input type="checkbox" checked={rowChanges.regulator ?? diver.regulator ?? false} onChange={e => handleChange(diver.id, 'regulator', e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer" />
                    </td>
                    <td className="px-2 py-2 border-r text-center">
                      <input type="checkbox" checked={rowChanges.computer ?? diver.computer ?? false} onChange={e => handleChange(diver.id, 'computer', e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer" />
                    </td>

                    {/* Tank 1 Chip */}
                    <td className="px-2 py-1 border-r text-center">
                      {(rowChanges.nitrox1 ?? diver.nitrox1) ? (
                        <div
                          title="Click to revert to Air"
                          onClick={() => { handleChange(diver.id, 'nitrox1', false); handleChange(diver.id, 'nitrox_percentage1', null); }}
                          className="inline-flex items-center gap-0.5 bg-emerald-100 border border-emerald-300 rounded-full px-2 py-0.5 cursor-pointer hover:bg-emerald-200 transition-colors"
                        >
                          <input
                            type="number"
                            value={rowChanges.nitrox_percentage1 ?? diver.nitrox_percentage1 ?? 32}
                            onChange={e => handleChange(diver.id, 'nitrox_percentage1', parseInt(e.target.value))}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleSave(); }}
                            className="w-7 text-[10px] font-black text-emerald-700 bg-transparent border-none focus:ring-0 p-0 text-center"
                          />
                          <span className="text-[10px] font-bold text-emerald-600">%</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => { handleChange(diver.id, 'nitrox1', true); handleChange(diver.id, 'nitrox_percentage1', 32); }}
                          className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-full px-3 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200 transition-colors cursor-pointer"
                        >
                          Air
                        </button>
                      )}
                    </td>

                    {/* Tank 2 Chip */}
                    <td className="px-2 py-1 border-r text-center">
                      {(rowChanges.nitrox2 ?? diver.nitrox2) ? (
                        <div
                          title="Click to revert to Air"
                          onClick={() => { handleChange(diver.id, 'nitrox2', false); handleChange(diver.id, 'nitrox_percentage2', null); }}
                          className="inline-flex items-center gap-0.5 bg-emerald-100 border border-emerald-300 rounded-full px-2 py-0.5 cursor-pointer hover:bg-emerald-200 transition-colors"
                        >
                          <input
                            type="number"
                            value={rowChanges.nitrox_percentage2 ?? diver.nitrox_percentage2 ?? 32}
                            onChange={e => handleChange(diver.id, 'nitrox_percentage2', parseInt(e.target.value))}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') handleSave(); }}
                            className="w-7 text-[10px] font-black text-emerald-700 bg-transparent border-none focus:ring-0 p-0 text-center"
                          />
                          <span className="text-[10px] font-bold text-emerald-600">%</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => { handleChange(diver.id, 'nitrox2', true); handleChange(diver.id, 'nitrox_percentage2', 32); }}
                          className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-full px-3 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200 transition-colors cursor-pointer"
                        >
                          Air
                        </button>
                      )}
                    </td>

                    {/* Weights */}
                    <td className="px-2 py-1 border-r text-center">
                      <input type="text" value={rowChanges.weights ?? diver.weights ?? ''} onChange={e => handleChange(diver.id, 'weights', e.target.value === '' ? null : e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="-" className="w-12 text-[10px] font-bold text-slate-700 bg-transparent border-none focus:ring-1 focus:ring-teal-500 rounded p-0.5 text-center placeholder:text-slate-300"/>
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
                  {Array.from({ length: 16 }).map((_, j) => (
                    <td key={j} className="px-2 py-2">
                      <span className="block h-[18px]" />
                    </td>
                  ))}
                </tr>
              ));
            })()}
            {/* Filler row — stretches to fill remaining container height */}
            <tr className="h-full"><td colSpan={18} /></tr>
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
            const movedIds = [diverAction.diver.id, ...(diverAction.companions.map((c: any) => c.id))];
            setPendingChanges(prev => {
              const next = { ...prev };
              movedIds.forEach(id => { delete next[id]; });
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