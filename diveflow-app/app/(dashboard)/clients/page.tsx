"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";

export default function ClientsPage() {
  const supabase = createClient();
  
  // Auth & Org State
  const [userOrgId, setUserOrgId] = useState<string | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Main View State
  const [recentClients, setRecentClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [clientVisits, setClientVisits] = useState<any[]>([]);
  const [certLevels, setCertLevels] = useState<any[]>([]);
  const [certOrgs, setCertOrgs] = useState<any[]>([]);
  
  // Form & Modal States
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 1. Fetch User's Organization ID on load
  useEffect(() => {
    async function getUserProfile() {
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
    getUserProfile();
  }, [supabase]);

  // 2. Fetch Recently Added Clients
  useEffect(() => {
    async function fetchRecent() {
      if (!userOrgId) return; // Only fetch if we know the org
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("organization_id", userOrgId)
        .order("created_at", { ascending: false })
        .limit(6);
      if (data) setRecentClients(data);
    }
    fetchRecent();
  }, [userOrgId, supabase]);

  // Fetch Certification Levels
  useEffect(() => {
    async function fetchCertLevels() {
      const { data } = await supabase
        .from("certification_levels")
        .select("*")
        .order("id", { ascending: true });
      if (data) setCertLevels(data);
    }
    fetchCertLevels();
  }, [supabase]);

  // Fetch Certification Organizations
  useEffect(() => {
    async function fetchCertOrgs() {
      const { data } = await supabase
        .from("certification_organizations")
        .select("*")
        .order("name", { ascending: true });
      if (data) setCertOrgs(data);
    }
    fetchCertOrgs();
  }, [supabase]);

  // 3. Handle Live Search
  useEffect(() => {
    async function performSearch() {
      if (!searchQuery.trim() || !userOrgId) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }
      setIsSearching(true);
      setShowDropdown(true);

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

  // 4. Fetch Client Visits
  useEffect(() => {
    async function fetchVisits() {
      if (!selectedClient) return;
      const { data } = await supabase
        .from("visit_clients")
        .select(`
          id, room_number, arrival_time, departure_time, transfer_needed,
          visits ( id, start_date, end_date, hotels ( name ) )
        `)
        .eq("client_id", selectedClient.id);
      setClientVisits(data || []);
    }
    fetchVisits();
  }, [selectedClient, supabase]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectClient = (client: any) => {
    setSelectedClient(client);
    setShowDropdown(false);
    setSearchQuery("");
  };

  // 5. Handle Creating a NEW Client
  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userOrgId) {
      alert("Error: No organization found for your profile. Please contact support.");
      return;
    }
    
    setIsCreating(true);
    const formData = new FormData(e.currentTarget);
    
    // If email is empty, send null so it doesn't violate unique constraints
    const emailValue = formData.get("email") as string;
    const finalEmail = emailValue.trim() === "" ? null : emailValue.trim();
    
    const newClient = {
      organization_id: userOrgId,
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      email: finalEmail,
      phone: formData.get("phone") || null,
    };

    const { data, error } = await supabase
      .from("clients")
      .insert(newClient)
      .select()
      .single();

    setIsCreating(false);

    if (!error && data) {
      setIsModalOpen(false); 
      setRecentClients([data, ...recentClients].slice(0, 6)); 
      setSelectedClient(data); 
    } else {
      alert(`Error creating client: ${error?.message}`);
    }
  };

  // 6. Handle Saving Edits (Existing Client)
  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedClient) return;
    setIsSaving(true);
    
    const formData = new FormData(e.currentTarget);
    const updates = {
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      address_street: formData.get("address_street"),
      address_city: formData.get("address_city"),
      address_zip: formData.get("address_zip"),
      address_country: formData.get("address_country"),
      cert_organization: formData.get("cert_organization"),
      cert_level: formData.get("cert_level"),
      cert_number: formData.get("cert_number"),
      nitrox_cert_number: formData.get("nitrox_cert_number"),
      last_dive_date: formData.get("last_dive_date") || null,
      notes: formData.get("notes"),
    };

    const { error } = await supabase.from("clients").update(updates).eq("id", selectedClient.id);
    setIsSaving(false);

    if (!error) {
      alert("Client updated successfully!");
      setSelectedClient({ ...selectedClient, ...updates });
      setRecentClients(recentClients.map(c => c.id === selectedClient.id ? { ...c, ...updates } : c));
    } else {
      alert("Error updating client.");
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full flex flex-col gap-8 h-[calc(100vh-4rem)] relative">
      
      {/* Top Section */}
      <div className="flex justify-between items-start gap-8 z-20 shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Client Directory</h1>
          <p className="text-sm text-slate-500 mt-1">Search, edit, and manage diver profiles.</p>
        </div>

        <div className="flex-1 max-w-2xl relative" ref={searchRef}>
          <div className="relative">
            <input
              type="text"
              placeholder="Search by diver name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.trim() && setShowDropdown(true)}
              className="w-full px-4 py-3 pl-11 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
            <svg className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {showDropdown && (
            <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
              {isSearching ? (
                <div className="p-4 text-center text-sm text-slate-500">Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">No divers found.</div>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                  {searchResults.map((client) => (
                    <li key={client.id}>
                      <button
                        onClick={() => handleSelectClient(client)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex justify-between items-center"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-800">{client.first_name} {client.last_name}</p>
                          <p className="text-xs text-slate-500">{client.email}</p>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          {client.cert_level || "No Cert"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg text-sm font-medium shadow-sm flex-shrink-0 transition-colors"
        >
          + New Client
        </button>
      </div>

      {/* Main Content Area */}
      {!selectedClient ? (
        <div className="overflow-y-auto pb-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Recently Added Divers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentClients.map(client => (
              <button
                key={client.id}
                onClick={() => handleSelectClient(client)}
                className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left flex flex-col gap-2"
              >
                <div>
                  <p className="font-medium text-slate-800">{client.first_name} {client.last_name}</p>
                  <p className="text-sm text-slate-500">{client.email}</p>
                </div>
                <div className="mt-2 inline-block px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-600 w-fit">
                  {client.cert_level || "No Certification Listed"}
                </div>
              </button>
            ))}
            {recentClients.length === 0 && (
              <p className="text-sm text-slate-500 col-span-3">No clients have been added yet.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex gap-6 items-start flex-1 min-h-0">
          
          {/* Left Column: Client Details */}
          <div className="w-6/12 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
<div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
  {/* Increased gap from 3 to 5 for much better spacing */}
  <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-5 truncate">
    <span className="truncate">
      {selectedClient.first_name} {selectedClient.last_name}
    </span>
    
    {/* Pulled the number into its own span so it obeys the flex gap */}
    <span className="font-normal text-slate-500 shrink-0">
      #{selectedClient.client_number}
    </span>
    
    {/* Certification Chip */}
    {selectedClient.cert_level && (
      <span 
        title={selectedClient.nitrox_cert_number ? `Nitrox Cert: ${selectedClient.nitrox_cert_number}` : "Standard Air"}
        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border shrink-0 ${
          selectedClient.nitrox_cert_number?.trim() 
            ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
            : "bg-slate-100 text-slate-500 border-slate-200"
        }`}
      >
        {certLevels.find(c => c.name === selectedClient.cert_level)?.abbreviation || selectedClient.cert_level}
      </span>
    )}
  </h2>
</div>
  <button onClick={() => setSelectedClient(null)} className="text-sm text-slate-500 hover:text-slate-800 font-medium shrink-0">
    Close
  </button>
</div>
            
            <form key={selectedClient.id} onSubmit={handleSave} className="p-6 flex flex-col gap-8 overflow-y-auto">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Contact Info</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
                    <input name="first_name" defaultValue={selectedClient.first_name} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
                    <input name="last_name" defaultValue={selectedClient.last_name} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                    <input name="email" type="email" defaultValue={selectedClient.email} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                    <input name="phone" defaultValue={selectedClient.phone || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Diving Profile</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">Organization</label>
    <select 
      name="cert_organization" 
      defaultValue={selectedClient.cert_organization || ""} 
      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700"
    >
      <option value="">Select Organization</option>
      {certOrgs.map(org => (
        <option key={org.id} value={org.name}>
          {org.name}
        </option>
      ))}
    </select>
  </div>
<div>
    <label className="block text-xs font-medium text-slate-600 mb-1">Level</label>
    <select 
      name="cert_level" 
      defaultValue={selectedClient.cert_level || ""} 
      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700"
    >
      <option value="">No Certification Listed</option>
      
      {/* Recreational Levels */}
      <optgroup label="Recreational">
        {certLevels.filter(level => !level.is_professional).map(level => (
          <option key={level.id} value={level.name}>
            {level.name} ({level.abbreviation})
          </option>
        ))}
      </optgroup>

      {/* Professional Levels */}
      <optgroup label="Professional">
        {certLevels.filter(level => level.is_professional).map(level => (
          <option key={level.id} value={level.name}>
            {level.name} ({level.abbreviation}) ✦
          </option>
        ))}
      </optgroup>
    </select>
  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Cert Number</label>
                    <input name="cert_number" defaultValue={selectedClient.cert_number || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Nitrox Number</label>
                    <input name="nitrox_cert_number" defaultValue={selectedClient.nitrox_cert_number || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Date of Last Dive</label>
                  <input name="last_dive_date" type="date" defaultValue={selectedClient.last_dive_date || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Address</h3>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Street</label>
                  <input name="address_street" defaultValue={selectedClient.address_street || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                    <input name="address_city" defaultValue={selectedClient.address_city || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">ZIP / Postal</label>
                    <input name="address_zip" defaultValue={selectedClient.address_zip || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
                    <input name="address_country" defaultValue={selectedClient.address_country || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Additional Notes</h3>
                <textarea name="notes" defaultValue={selectedClient.notes || ""} rows={3} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="Any special requirements or notes about this diver..."></textarea>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end shrink-0 sticky bottom-0 bg-white">
                <button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-70">
                  {isSaving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Visits History */}
          <div className="w-6/12 bg-white rounded-xl shadow-sm border border-slate-200 h-full overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
              <h2 className="text-lg font-semibold text-slate-800">Visit History</h2>
              <button className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors">
                + Add Visit
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {clientVisits.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  <p>No visits recorded for this diver.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {clientVisits.map((visitLink) => {
                    const visit = visitLink.visits;
                    return (
                      <div key={visitLink.id} className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-semibold text-slate-800">
                              {visit?.start_date ? new Date(visit.start_date).toLocaleDateString() : "Unknown"} 
                              {" - "} 
                              {visit?.end_date ? new Date(visit.end_date).toLocaleDateString() : "Unknown"}
                            </p>
                            <p className="text-sm text-slate-600 flex items-center gap-1 mt-1">
                              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              {visit?.hotels?.name || "No Hotel Specified"}
                            </p>
                          </div>
                          {visitLink.room_number && (
                            <span className="bg-slate-100 text-slate-600 text-xs font-medium px-2.5 py-1 rounded border border-slate-200">
                              Room {visitLink.room_number}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* MODAL: Create New Client */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-full">
            
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-800">Add New Diver</h2>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-5 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                  <input name="first_name" className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" required autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                  <input name="last_name" className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                {/* Removed the 'required' attribute here */}
                <input name="email" type="email" className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input name="phone" className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              <div className="pt-4 mt-2 border-t border-slate-100 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isCreating}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-70"
                >
                  {isCreating ? "Creating..." : "Create Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}