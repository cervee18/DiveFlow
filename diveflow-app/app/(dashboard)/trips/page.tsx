'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import TripTopBar from './components/TripTopBar'; 
import TripHeader from './components/TripHeader';
import TripFormModal from '@/app/(dashboard)/components/TripFormModal';
import TripManifest from './components/TripManifest';
import { useRouter } from 'next/navigation';

export default function TripsPage() {
  const supabase = createClient();
  const router   = useRouter();
  
  // -- State --
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window === 'undefined') {
      const today = new Date();
      return new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    }
    const params = new URLSearchParams(window.location.search);
    const today  = new Date();
    const todayStr = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    return params.get('date') ?? localStorage.getItem('diveflow_date') ?? todayStr;
  });
  const [selectedTripId, setSelectedTripId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('tripId');
  });

  const [trips, setTrips] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userOrgId, setUserOrgId] = useState<string | null>(null);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode,   setModalMode]   = useState<'add' | 'edit'>('add');
  const [editingTrip, setEditingTrip] = useState<any>(null);

  // Keep URL in sync and share date with other pages via localStorage
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('date', selectedDate);
    if (selectedTripId) params.set('tripId', selectedTripId);
    router.replace(`?${params.toString()}`, { scroll: false });
    localStorage.setItem('diveflow_date', selectedDate);
  }, [selectedDate, selectedTripId]);

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
  capacity={selectedTrip.max_divers}
  numberOfDives={selectedTrip.trip_types?.number_of_dives ?? 1}
  onManifestChange={() => setRefreshTrigger(prev => prev + 1)}
  onMovedToTrip={(trip) => {
    const d = new Date(trip.start_time);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setSelectedTripId(trip.id);
    setRefreshTrigger(prev => prev + 1);
  }}
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
        selectedDate={selectedDate}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => setRefreshTrigger(prev => prev + 1)}
      />
    </div>
  );
}