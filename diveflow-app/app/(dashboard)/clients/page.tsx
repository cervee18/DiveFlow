// app/(dashboard)/clients/page.tsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

import ClientTopBar from "./components/ClientTopBar";
import RecentClientsGrid from "./components/RecentClientsGrid";
import ClientProfileForm from "./components/ClientProfileForm";
import ClientVisitHistory from "./components/ClientVisitHistory";
import ClientFormModal from "./components/ClientFormModal";
import VisitFormModal from "./components/VisitFormModal";

function ClientsContent() {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  // FIX 3: use Next.js useSearchParams — not window.location.search
  const searchParams = useSearchParams();

  const [userOrgId, setUserOrgId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [recentClients, setRecentClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [clientVisits, setClientVisits] = useState<any[]>([]);
  const [clientTrips, setClientTrips] = useState<any[]>([]);

  const [certLevels, setCertLevels] = useState<any[]>([]);
  const [certOrgs, setCertOrgs] = useState<any[]>([]);
  const [hotels, setHotels] = useState<any[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [visitModalMode, setVisitModalMode] = useState<"add" | "edit" | null>(null);
  const [editingVisit, setEditingVisit] = useState<any>(null);

  // ── Initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    async function loadInitialData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .single();
        if (profile) setUserOrgId(profile.organization_id);
      }

      const { data: levels } = await supabase
        .from("certification_levels")
        .select("*")
        .order("id", { ascending: true });
      if (levels) setCertLevels(levels);

      const { data: orgs } = await supabase
        .from("certification_organizations")
        .select("*")
        .order("name", { ascending: true });
      if (orgs) setCertOrgs(orgs);

      const { data: h } = await supabase
        .from("hotels")
        .select("*")
        .order("name", { ascending: true });
      if (h) setHotels(h);
    }
    loadInitialData();
  }, [supabase]);

  useEffect(() => {
    async function fetchRecent() {
      if (!userOrgId) return;
      const { data } = await supabase
        .from("clients")
        .select("*, certification_levels!cert_level(abbreviation)")
        .eq("organization_id", userOrgId)
        .order("created_at", { ascending: false })
        .limit(6);
      if (data) setRecentClients(data);
    }
    fetchRecent();
  }, [userOrgId, supabase]);

  useEffect(() => {
    async function performSearch() {
      if (!searchQuery.trim() || !userOrgId) {
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

  // ── Client history ─────────────────────────────────────────────────────────
  const fetchClientHistory = async (clientId: string) => {
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
      .order("visits(start_date)", { ascending: false });
    setClientVisits(vData || []);

    const { data: tData } = await supabase
      .from("trip_clients")
      .select(`
        id,
        trips (
          id, start_time, duration_minutes,
          trip_types ( name ),
          vessels ( name ),
          dive_sites ( name )
        )
      `)
      .eq("client_id", clientId);
    setClientTrips(tData || []);
  };

  // ── URL → selected client (FIX 3: useSearchParams, not window.location) ───
  useEffect(() => {
    const clientIdParam = searchParams.get("clientId");
    if (clientIdParam && (!selectedClient || selectedClient.id !== clientIdParam)) {
      supabase
        .from("clients")
        .select("*")
        .eq("id", clientIdParam)
        .single()
        .then(({ data }) => { if (data) setSelectedClient(data); });
    } else if (!clientIdParam && selectedClient) {
      setSelectedClient(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (selectedClient) fetchClientHistory(selectedClient.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectClient = (client: any) => {
    setSelectedClient(client);
    setSearchQuery("");
    router.push(`${pathname}?clientId=${client.id}`, { scroll: false });
  };

  const handleUpdateClientState = (updatedClient: any) => {
    setSelectedClient(updatedClient);
    setRecentClients(recentClients.map((c) => c.id === updatedClient.id ? updatedClient : c));
  };

  const handleCreateClientSuccess = (newClient: any) => {
    setRecentClients([newClient, ...recentClients].slice(0, 6));
    handleSelectClient(newClient);
    setIsModalOpen(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex flex-col gap-8 h-[calc(100vh-4rem)] relative">
      {/*
        FIX 1 (display): certLevels passed so TopBar can resolve cert UUID → abbreviation.
        The search query already returns the full client row including cert_level UUID.
      */}
      <ClientTopBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        isSearching={isSearching}
        certLevels={certLevels}
        onSelectClient={handleSelectClient}
        onOpenAddModal={() => setIsModalOpen(true)}
      />

      {!selectedClient ? (
        <RecentClientsGrid
          recentClients={recentClients}
          onSelectClient={handleSelectClient}
        />
      ) : (
        <div className="flex gap-6 items-start flex-1 min-h-0">
          <ClientProfileForm
            selectedClient={selectedClient}
            certLevels={certLevels}
            certOrgs={certOrgs}
            onClose={() => {
              setSelectedClient(null);
              router.push(pathname, { scroll: false });
            }}
            onUpdate={handleUpdateClientState}
          />
          <ClientVisitHistory
            selectedClient={selectedClient}
            clientVisits={clientVisits}
            clientTrips={clientTrips}
            onAddVisit={() => setVisitModalMode("add")}
            onEditVisit={(visitLink) => {
              setEditingVisit(visitLink);
              setVisitModalMode("edit");
            }}
            onRefreshVisits={() => fetchClientHistory(selectedClient.id)}
            onSelectCompanion={handleSelectClient}
          />
        </div>
      )}

      {isModalOpen && (
        <ClientFormModal
          userOrgId={userOrgId}
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
    </div>
  );
}

export default function ClientsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading Client Directory...</div>}>
      <ClientsContent />
    </Suspense>
  );
}