// app/(dashboard)/clients/page.tsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Components
import ClientTopBar from "./components/ClientTopBar";
import RecentClientsGrid from "./components/RecentClientsGrid";
import ClientProfileForm from "./components/ClientProfileForm";
import ClientVisitHistory from "./components/ClientVisitHistory";
import ClientFormModal from "./components/ClientFormModal";
import VisitFormModal from "./components/VisitFormModal";
import TripDrawer from "@/app/(dashboard)/components/TripDrawer";

// We extract the main content into a sub-component so we can wrap it in <Suspense>
function ClientsContent() {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Auth & Org State
  const [userOrgId, setUserOrgId] = useState<string | null>(null);
  const [requireVisitDefault, setRequireVisitDefault] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Main View State
  const [recentClients, setRecentClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [clientVisits, setClientVisits] = useState<any[]>([]);
  const [clientTrips, setClientTrips] = useState<any[]>([]);
  
  // Lookups
  const [certLevels, setCertLevels] = useState<any[]>([]);
  const [certOrgs, setCertOrgs] = useState<any[]>([]);
  const [hotels, setHotels] = useState<any[]>([]);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [visitModalMode, setVisitModalMode] = useState<'add' | 'edit' | null>(null);
  const [editingVisit, setEditingVisit] = useState<any>(null);

  // Trip drawer
  const [drawerTripId, setDrawerTripId] = useState<string | null>(null);

  // --- Data Fetching ---
  useEffect(() => {
    async function loadInitialData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
        if (profile) {
          setUserOrgId(profile.organization_id);
          const { data: org } = await supabase
            .from("organizations")
            .select("require_visit_for_trips")
            .eq("id", profile.organization_id)
            .single();
          if (org) setRequireVisitDefault(org.require_visit_for_trips ?? false);
        }
      }
      const { data: levels } = await supabase.from("certification_levels").select("*").order("id", { ascending: true });
      if (levels) setCertLevels(levels);
      
      const { data: orgs } = await supabase.from("certification_organizations").select("*").order("name", { ascending: true });
      if (orgs) setCertOrgs(orgs);

      const { data: h } = await supabase.from("hotels").select("*").order("name", { ascending: true });
      if (h) setHotels(h);
    }
    loadInitialData();
  }, [supabase]);

  useEffect(() => {
    async function fetchRecent() {
      if (!userOrgId) return;
      const { data } = await supabase.from("clients").select("*").eq("organization_id", userOrgId).order("created_at", { ascending: false }).limit(6);
      if (data) setRecentClients(data);
    }
    fetchRecent();
  }, [userOrgId, supabase]);

  useEffect(() => {
    async function performSearch() {
      if (searchQuery.trim().length < 2 || !userOrgId) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("organization_id", userOrgId)
        .or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(10);
      
      setSearchResults(data || []);
      setIsSearching(false);
    }
    const timer = setTimeout(() => performSearch(), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, userOrgId, supabase]);

  const fetchClientHistory = async (clientId: string) => {
    // 1. Fetch Visits
    const { data: vData } = await supabase
      .from("visit_clients")
      .select(`
        id, room_number,
        visits (
          id, start_date, end_date, hotel_id,
          hotels ( name ),
          visit_clients (
            id, client_id,
            clients ( id, client_number, first_name, last_name )
          )
        )
      `)
      .eq("client_id", clientId)
      .order('visits(start_date)', { ascending: false });
    
    setClientVisits(vData || []);

    // 2. Fetch Trips
    const { data: tData } = await supabase
      .from("trip_clients")
      .select(`
        id,
        trips (
          id, start_time, duration_minutes,
          trip_types ( name ),
          vessels ( name ),
          divesites ( name )
        )
      `)
      .eq("client_id", clientId);

    setClientTrips(tData || []);
  };

  // -- Catch URL Parameters for Back Button Support --
  useEffect(() => {
    const clientIdParam = searchParams.get('clientId');
    
    if (clientIdParam && (!selectedClient || selectedClient.id !== clientIdParam)) {
      const fetchClientFromUrl = async () => {
        const { data } = await supabase
          .from("clients")
          .select("*")
          .eq("id", clientIdParam)
          .single();
        if (data) setSelectedClient(data);
      };
      fetchClientFromUrl();
    } else if (!clientIdParam && selectedClient) {
      setSelectedClient(null);
    }
  }, [searchParams, selectedClient, supabase]);

  useEffect(() => {
    if (selectedClient) fetchClientHistory(selectedClient.id);
  }, [selectedClient, supabase]);

  // --- Handlers ---
  const handleSelectClient = (client: any) => {
    setSelectedClient(client);
    setSearchQuery("");
    router.push(`${pathname}?clientId=${client.id}`, { scroll: false });
  };

  const handleUpdateClientState = (updatedClient: any) => {
    setSelectedClient(updatedClient);
    setRecentClients(recentClients.map(c => c.id === updatedClient.id ? updatedClient : c));
  };

  const handleDeleteClient = (clientId: string) => {
    setSelectedClient(null);
    setRecentClients(recentClients.filter(c => c.id !== clientId));
    router.push(pathname, { scroll: false });
  };

  const handleCreateClientSuccess = (newClient: any) => {
    setRecentClients([newClient, ...recentClients].slice(0, 6)); 
    handleSelectClient(newClient); // Select immediately and push URL
    setIsModalOpen(false);
  };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto w-full flex flex-col gap-8 h-auto lg:h-[calc(100vh-4rem)] overflow-y-auto lg:overflow-hidden relative">
      <ClientTopBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        isSearching={isSearching}
        certLevels={certLevels}
        onSelectClient={handleSelectClient}
        onOpenAddModal={() => setIsModalOpen(true)}
      />

      {/* Main Content Area */}
      {!selectedClient ? (
        <RecentClientsGrid
          recentClients={recentClients}
          certLevels={certLevels}
          onSelectClient={handleSelectClient}
        />
      ) : (
        <div className="flex flex-col lg:flex-row gap-6 items-start lg:flex-1 lg:min-h-0">
          <ClientProfileForm
            selectedClient={selectedClient}
            certLevels={certLevels}
            certOrgs={certOrgs}
            onClose={() => {
              setSelectedClient(null);
              router.push(pathname, { scroll: false }); // Clears the URL
            }}
            onUpdate={handleUpdateClientState}
            onDelete={handleDeleteClient}
          />

          <ClientVisitHistory
            selectedClient={selectedClient}
            clientVisits={clientVisits}
            clientTrips={clientTrips}
            onAddVisit={() => setVisitModalMode('add')}
            onEditVisit={(visitLink) => {
              setEditingVisit(visitLink);
              setVisitModalMode('edit');
            }}
            onRefreshVisits={() => fetchClientHistory(selectedClient.id)}
            onSelectCompanion={handleSelectClient}
            onOpenTrip={setDrawerTripId}
          />
        </div>
      )}

      {/* Modals */}
      {isModalOpen && (
        <ClientFormModal
          userOrgId={userOrgId}
          requireVisitDefault={requireVisitDefault}
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleCreateClientSuccess}
        />
      )}

      {visitModalMode && (
        <VisitFormModal
          mode={visitModalMode}
          editingVisit={editingVisit}
          selectedClientId={selectedClient?.id}
          userOrgId={userOrgId}
          hotels={hotels}
          clientVisits={clientVisits}
          onClose={() => { setVisitModalMode(null); setEditingVisit(null); }}
          onSuccess={() => fetchClientHistory(selectedClient.id)}
        />
      )}

      <TripDrawer
        isOpen={drawerTripId !== null}
        tripId={drawerTripId}
        onClose={() => setDrawerTripId(null)}
        onMovedToTrip={(trip) => setDrawerTripId(trip.id)}
      />
    </div>
  );
}

// Next.js requires useSearchParams to be wrapped in a Suspense boundary 
export default function ClientsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading Client Directory...</div>}>
      <ClientsContent />
    </Suspense>
  );
}