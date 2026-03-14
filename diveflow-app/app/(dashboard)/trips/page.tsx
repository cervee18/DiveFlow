'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function TripsPage() {
  const supabase = createClient();
  
  // -- State --
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const localOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - localOffset).toISOString().split('T')[0];
  });
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  
  const [trips, setTrips] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userOrgId, setUserOrgId] = useState<string | null>(null);
  
  // Reference Data for forms
  const [vessels, setVessels] = useState<any[]>([]);
  const [tripTypes, setTripTypes] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingTrip, setEditingTrip] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Controlled Form State for auto-filling
  const [formTime, setFormTime] = useState("08:00");
  const [formDuration, setFormDuration] = useState(240);

  // 1. Get user's organization on mount
  useEffect(() => {
    async function getUserOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .single();
        if (profile) setUserOrgId(profile.organization_id);
      }
    }
    getUserOrg();
  }, [supabase]);

  // 2. Fetch reference data (Vessels & Trip Types)
  useEffect(() => {
    async function fetchReferenceData() {
      if (!userOrgId) return;
      
      const { data: vData } = await supabase
        .from('vessels')
        .select('id, name, capacity')
        .eq('organization_id', userOrgId)
        .order('name', { ascending: true });
      if (vData) setVessels(vData);

      const { data: tData } = await supabase
        .from('trip_types')
        .select('*')
        .eq('organization_id', userOrgId)
        .order('default_start_time', { ascending: true });
      if (tData) setTripTypes(tData);
    }
    fetchReferenceData();
  }, [userOrgId, supabase]);

  // 3. Fetch trips
  useEffect(() => {
    async function fetchTrips() {
      if (!userOrgId || !selectedDate) return;
      setIsLoading(true);

      const [year, month, day] = selectedDate.split('-').map(Number);
      const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);

      const { data, error } = await supabase
        .from('trips')
        .select(`
          *,
          trip_clients ( id ),
          vessels ( name, capacity ),
          trip_types ( id, name, default_start_time, number_of_dives ),
          trip_staff (
            roles ( name ),
            staff (
              id,
              first_name,
              last_name,
              initials
            )
          )
        `)
        .eq('organization_id', userOrgId)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .order('start_time', { ascending: true });

      if (!error && data) {
        const formattedTrips = data.map(trip => ({
          ...trip,
          booked_divers: trip.trip_clients?.length || 0
        }));
        setTrips(formattedTrips);
      } else {
        console.error("Error fetching trips:", error);
      }
      setIsLoading(false);
    }

    fetchTrips();
  }, [selectedDate, userOrgId, refreshTrigger, supabase]);

  // -- Handlers --

  const handleDeleteTrip = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this trip? All manifest data will be lost.")) return;
    const { error } = await supabase.from('trips').delete().eq('id', id);
    if (!error) {
      setSelectedTripId(null);
      setRefreshTrigger(prev => prev + 1);
    } else {
      alert("Error deleting trip: " + error.message);
    }
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedType = tripTypes.find(t => t.id === selectedId);
    if (selectedType) {
      // Format '08:00:00' to '08:00' for the HTML time input
      setFormTime(selectedType.default_start_time.substring(0, 5));
      // Smart default: 120 mins per dive
      setFormDuration(selectedType.number_of_dives * 120); 
    }
  };

  const handleSaveTrip = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userOrgId) return;
    setIsSaving(true);

    const fd = new FormData(e.currentTarget);
    
    const dateStr = fd.get("date") as string;
    const timeStr = fd.get("time") as string;
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    const start_time = new Date(year, month - 1, day, hours, minutes).toISOString();

    const tripData = {
      organization_id: userOrgId,
      label: fd.get("label"),
      trip_type_id: fd.get("trip_type_id"),
      entry_mode: fd.get("entry_mode"),
      start_time: start_time,
      duration_minutes: Number(fd.get("duration_minutes")),
      max_divers: Number(fd.get("max_divers")),
      vessel_id: fd.get("vessel_id") || null,
    };

    if (modalMode === 'add') {
      const { error } = await supabase.from('trips').insert(tripData);
      if (error) alert("Error creating trip: " + error.message);
    } else {
      const { error } = await supabase.from('trips').update(tripData).eq('id', editingTrip.id);
      if (error) alert("Error updating trip: " + error.message);
    }

    setIsSaving(false);
    setIsModalOpen(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const openAddModal = () => {
    setModalMode('add');
    setEditingTrip(null);
    if (tripTypes.length > 0) {
      setFormTime(tripTypes[0].default_start_time.substring(0, 5));
      setFormDuration(tripTypes[0].number_of_dives * 120);
    }
    setIsModalOpen(true);
  };

  const openEditModal = (trip: any) => {
    setModalMode('edit');
    setEditingTrip(trip);
    setFormTime(getLocalInputValues(trip.start_time).timeStr);
    setFormDuration(trip.duration_minutes);
    setIsModalOpen(true);
  };

  // -- Helpers --
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getLocalInputValues = (isoString: string) => {
    const d = new Date(isoString);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return { dateStr, timeStr };
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-slate-50 relative">
      {/* LEFT COLUMN: Master View */}
      <div className="w-96 flex flex-col border-r border-slate-200 bg-white shrink-0">
        
        <div className="p-4 border-b border-slate-200 bg-slate-50 z-10 shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-semibold text-slate-800">Daily Schedule</h1>
            <button 
              onClick={openAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-md shadow-sm transition-colors"
              title="Add New Trip"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          <div className="relative">
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedTripId(null);
              }}
              className="w-full bg-white border border-slate-200 text-slate-800 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-50/50">
          {isLoading ? (
            <div className="text-center text-slate-500 py-8 text-sm">Loading trips...</div>
          ) : trips.length === 0 ? (
            <div className="text-center text-slate-500 py-8 text-sm">No trips scheduled for this date.</div>
          ) : (
            trips.map((trip) => {
              const isSelected = selectedTripId === trip.id;
              const currentMaxCapacity = trip.vessels?.capacity || trip.max_divers;
              const spacesLeft = currentMaxCapacity - trip.booked_divers;
              const isFull = spacesLeft <= 0;

              return (
                <button
                  key={trip.id}
                  onClick={() => setSelectedTripId(trip.id)}
                  className={`w-full text-left transition-all flex items-center gap-3 px-3 py-3 rounded-lg border ${
                    isSelected 
                      ? 'bg-blue-50 border-blue-600 shadow-sm' 
                      : 'bg-transparent border-transparent hover:bg-slate-100'
                  }`}
                >
                  <div className={`w-16 shrink-0 text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                    {formatTime(trip.start_time)}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <span className={`text-sm font-medium truncate ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                      {trip.trip_types?.name || 'Unknown Type'}
                    </span>
                    <span className={`text-[10px] truncate mt-0.5 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`}>
                      {trip.label}
                    </span>
                  </div>

                  <div className={`shrink-0 text-xs font-semibold px-2 py-1 rounded ${
                    isFull 
                      ? 'text-amber-700 bg-amber-100' 
                      : isSelected 
                        ? 'text-blue-700 bg-blue-100' 
                        : 'text-slate-600 bg-slate-200'
                  }`}>
                    {isFull ? 'Full' : `${spacesLeft} left`}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Detail View */}
      <div className="flex-1 bg-slate-50 p-6 overflow-y-auto min-w-0">
        {selectedTripId ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-full p-8 flex flex-col">
            {(() => {
              const trip = trips.find(t => t.id === selectedTripId);
              if (!trip) return null;
              
              return (
                <>
                  <div className="border-b border-slate-100 pb-6 mb-6">
                    <div className="flex items-start justify-between gap-8">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <h2 className="text-2xl font-bold text-slate-800 truncate">{trip.label}</h2>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => openEditModal(trip)} className="text-slate-400 hover:text-blue-600 transition-colors p-1" title="Edit Trip">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <button onClick={() => handleDeleteTrip(trip.id)} className="text-slate-400 hover:text-red-600 transition-colors p-1" title="Delete Trip">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                        <p className="text-slate-500 mt-2 flex items-center gap-2 text-sm">
                          <span>{formatTime(trip.start_time)}</span>
                          <span>•</span>
                          <span>{trip.duration_minutes / 60} hrs</span>
                          <span>•</span>
                          <span className="font-medium text-slate-700">{trip.trip_types?.name}</span>
                        </p>
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Staff</span>
                        {trip.trip_staff && trip.trip_staff.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {trip.trip_staff.map((ts: any) => (
                              <span 
                                key={ts.staff.id} 
                                className="inline-flex items-center justify-center min-w-[32px] px-2 py-1 rounded-md bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 cursor-default hover:bg-slate-100 transition-colors"
                                title={`${ts.staff.first_name} ${ts.staff.last_name} • ${ts.roles?.name || 'Unassigned Role'}`} 
                              >
                                {ts.staff.initials}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Unassigned</span>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assigned Vessel</span>
                        {trip.vessels?.name ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-100 text-sm">
                            {trip.vessels.name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">None</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Diver Manifest</h3>
                    <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                      <p className="text-slate-500">Diver list and equipment needs will go here.</p>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
            Select a trip from the timeline to view details
          </div>
        )}
      </div>

      {/* MODAL: Add / Edit Trip */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-full">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-800">
                {modalMode === 'add' ? 'Schedule New Trip' : 'Edit Trip'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleSaveTrip} className="p-6 flex flex-col gap-5 overflow-y-auto">
              {/* Row 1: Type & Entry Mode */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Trip Type *</label>
                  <select 
                    name="trip_type_id" 
                    defaultValue={editingTrip?.trip_type_id || (tripTypes.length > 0 ? tripTypes[0].id : "")} 
                    onChange={handleTypeChange}
                    required
                    className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    {tripTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Entry Mode *</label>
                  <select 
                    name="entry_mode" 
                    defaultValue={editingTrip?.entry_mode || "Boat"} 
                    className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="Boat">Boat</option>
                    <option value="Shore">Shore</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
                  <input 
                    type="date" 
                    name="date" 
                    defaultValue={modalMode === 'edit' ? getLocalInputValues(editingTrip.start_time).dateStr : selectedDate} 
                    required 
                    className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Time *</label>
                  <input 
                    type="time" 
                    name="time" 
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    required 
                    className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" 
                  />
                </div>
              </div>

              {/* Row 3: Label */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Custom Label (Optional)</label>
                <input 
                  type="text" 
                  name="label" 
                  placeholder="e.g. Special Wreck Run"
                  defaultValue={editingTrip?.label || ""} 
                  className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>

              {/* Row 4: Capacity & Duration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Base Capacity *</label>
                  <input 
                    type="number" 
                    name="max_divers" 
                    defaultValue={editingTrip?.max_divers || 14} 
                    required 
                    className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Duration (mins) *</label>
                  <input 
                    type="number" 
                    name="duration_minutes" 
                    value={formDuration}
                    onChange={(e) => setFormDuration(Number(e.target.value))}
                    required 
                    className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" 
                  />
                </div>
              </div>

              {/* Row 5: Vessel Assignment */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assign Vessel</label>
                <select 
                  name="vessel_id" 
                  defaultValue={editingTrip?.vessel_id || ""} 
                  className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="">No Vessel (Shore Dive)</option>
                  {vessels.map(v => (
                    <option key={v.id} value={v.id}>{v.name} (Cap: {v.capacity})</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 mt-2 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors">Cancel</button>
                <button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-70">
                  {isSaving ? "Saving..." : modalMode === 'add' ? "Create Trip" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}