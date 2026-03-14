'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import TripTopBar from './components/TripTopBar'; 
import TripHeader from './components/TripHeader';
import TripFormModal from './components/TripFormModal';
import TripManifest from './components/TripManifest';
import { useSearchParams } from 'next/navigation';

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
  
  const [vessels, setVessels] = useState<any[]>([]);
  const [tripTypes, setTripTypes] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingTrip, setEditingTrip] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

// -- Catch URL Parameters on Mount --
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dateParam = urlParams.get('date');
    const tripIdParam = urlParams.get('tripId');
    
    if (dateParam) setSelectedDate(dateParam);
    if (tripIdParam) setSelectedTripId(tripIdParam);
  }, []);

  // -- Data Fetching --
  useEffect(() => {
    async function getUserOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
        if (profile) setUserOrgId(profile.organization_id);
      }
    }
    getUserOrg();
  }, [supabase]);

  useEffect(() => {
    async function fetchReferenceData() {
      if (!userOrgId) return;
      
      const { data: vData } = await supabase.from('vessels').select('id, name, capacity').eq('organization_id', userOrgId).order('name', { ascending: true });
      if (vData) setVessels(vData);

      const { data: tData } = await supabase.from('trip_types').select('*').eq('organization_id', userOrgId).order('default_start_time', { ascending: true });
      if (tData) setTripTypes(tData);
    }
    fetchReferenceData();
  }, [userOrgId, supabase]);

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
          trip_staff ( roles ( name ), staff ( id, first_name, last_name, initials ) )
        `)
        .eq('organization_id', userOrgId)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())
        .order('start_time', { ascending: true });

      if (!error && data) {
        const formattedTrips = data.map(trip => ({ ...trip, booked_divers: trip.trip_clients?.length || 0 }));
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

  const handleSaveTrip = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userOrgId) return;
    setIsSaving(true);

    const fd = new FormData(e.currentTarget);
    const dateStr = fd.get("date") as string;
    const timeStr = fd.get("time") as string;
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    const tripData = {
      organization_id: userOrgId,
      label: fd.get("label"),
      trip_type_id: fd.get("trip_type_id"),
      entry_mode: fd.get("entry_mode"),
      start_time: new Date(year, month - 1, day, hours, minutes).toISOString(),
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
    setIsModalOpen(true);
  };

  const openEditModal = (trip: any) => {
    setModalMode('edit');
    setEditingTrip(trip);
    setIsModalOpen(true);
  };

  const handleSelectDate = (newDate: string) => {
    setSelectedDate(newDate);
    setSelectedTripId(null);
  };

  const selectedTrip = trips.find(t => t.id === selectedTripId);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50 relative overflow-hidden">
      
      {/* Top Bar now stretches across the entire top */}
      <TripTopBar 
        trips={trips} 
        selectedDate={selectedDate} 
        selectedTripId={selectedTripId} 
        isLoading={isLoading} 
        onSelectDate={handleSelectDate} 
        onSelectTrip={setSelectedTripId} 
        onAddTrip={openAddModal} 
      />

      {/* Main Content Area now takes full width and remaining height */}
      <div className="flex-1 bg-slate-50 p-6 overflow-y-auto min-w-0">
        {selectedTripId && selectedTrip ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-full p-8 flex flex-col">
            <TripHeader trip={selectedTrip} onEdit={openEditModal} onDelete={handleDeleteTrip} />
            <TripManifest 
  tripId={selectedTrip.id} 
  tripDate={selectedTrip.start_time}
  onManifestChange={() => setRefreshTrigger(prev => prev + 1)} 
/>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 bg-white rounded-xl shadow-sm border border-slate-200">
            Select a trip from the top bar to view details and manifest
          </div>
        )}
      </div>

      <TripFormModal 
        isOpen={isModalOpen} 
        mode={modalMode} 
        tripData={editingTrip} 
        vessels={vessels} 
        tripTypes={tripTypes} 
        selectedDate={selectedDate} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveTrip} 
        isSaving={isSaving} 
      />
    </div>
  );
}