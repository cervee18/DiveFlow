import { useState, useMemo, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";

interface VisitFormModalProps {
  mode: 'add' | 'edit';
  editingVisit: any;
  selectedClientId?: string;
  userOrgId: string | null;
  hotels: any[];
  clientVisits: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function VisitFormModal({
  mode,
  editingVisit,
  selectedClientId,
  userOrgId,
  hotels,
  clientVisits,
  onClose,
  onSuccess
}: VisitFormModalProps) {
  const supabase = createClient();
  const [isSavingVisit, setIsSavingVisit] = useState(false);

  const [startDate, setStartDate] = useState(editingVisit?.visits?.start_date || "");
  const [endDate, setEndDate] = useState(editingVisit?.visits?.end_date || "");

  const initialCompanions = useMemo(() => {
    if (mode === 'edit' && editingVisit?.visits?.visit_clients) {
      return editingVisit.visits.visit_clients
        .filter((vc: any) => vc.client_id !== selectedClientId)
        .map((vc: any) => vc.clients);
    }
    return [];
  }, [mode, editingVisit, selectedClientId]);

  const [selectedCompanions, setSelectedCompanions] = useState<any[]>(initialCompanions);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [showCreateCompanion, setShowCreateCompanion] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  // FIX 2: inline error for duplicate email in quick-create companion
  const [companionEmailError, setCompanionEmailError] = useState<string | null>(null);

  const hasOverlap = useMemo(() => {
    if (!startDate || !endDate || !clientVisits) return false;
    const newStart = new Date(startDate);
    const newEnd = new Date(endDate);
    return clientVisits.some(visitLink => {
      if (mode === 'edit' && editingVisit && visitLink.id === editingVisit.id) return false;
      const existingStart = new Date(visitLink.visits.start_date);
      const existingEnd = new Date(visitLink.visits.end_date);
      return newStart <= existingEnd && existingStart <= newEnd;
    });
  }, [startDate, endDate, clientVisits, mode, editingVisit]);

  useEffect(() => {
    async function performSearch() {
      if (!searchQuery.trim() || !userOrgId) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email, cert_level")
        .eq("organization_id", userOrgId)
        .neq("id", selectedClientId)
        .or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(5);
      const filtered = (data || []).filter(
        c => !selectedCompanions.some(sc => sc.id === c.id)
      );
      setSearchResults(filtered);
      setIsSearching(false);
    }
    const timer = setTimeout(() => performSearch(), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, userOrgId, selectedClientId, selectedCompanions, supabase]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddCompanion = (client: any) => {
    setSelectedCompanions([...selectedCompanions, client]);
    setSearchQuery("");
    setShowDropdown(false);
  };

  const handleRemoveCompanion = (clientId: string) => {
    setSelectedCompanions(selectedCompanions.filter(c => c.id !== clientId));
  };

  const handleQuickCreateCompanion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userOrgId) return;
    setIsCreating(true);
    setCompanionEmailError(null);

    const fd = new FormData(e.currentTarget);
    const emailValue = fd.get("email") as string;

    const newClient = {
      organization_id: userOrgId,
      first_name: fd.get("first_name"),
      last_name: fd.get("last_name"),
      email: emailValue.trim() === "" ? null : emailValue.trim(),
    };

    const { data, error } = await supabase
      .from("clients")
      .insert(newClient)
      .select()
      .single();
    setIsCreating(false);

    if (!error && data) {
      handleAddCompanion(data);
      setShowCreateCompanion(false);
    } else if (error) {
      // FIX 2: friendly message for duplicate email
      if (error.code === "23505") {
        setCompanionEmailError(
          "A client with this email already exists. Use a different email or leave it blank."
        );
      } else {
        alert(`Error creating client: ${error.message}`);
      }
    }
  };

  const handleSaveVisit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedClientId || !userOrgId || hasOverlap) return;
    setIsSavingVisit(true);

    const fd = new FormData(e.currentTarget);
    const hotelId = fd.get("hotel_id") || null;
    const roomNumber = fd.get("room_number") || null;

    let targetVisitId = null;

    if (mode === 'add') {
      const { data: newVisit, error: visitError } = await supabase
        .from("visits")
        .insert({
          organization_id: userOrgId,
          start_date: startDate,
          end_date: endDate,
          hotel_id: hotelId
        })
        .select()
        .single();

      if (!visitError && newVisit) {
        targetVisitId = newVisit.id;
        await supabase.from("visit_clients").insert({
          visit_id: targetVisitId,
          client_id: selectedClientId,
          room_number: roomNumber
        });
      }
    } else if (mode === 'edit' && editingVisit) {
      targetVisitId = editingVisit.visits.id;
      await supabase.from("visits").update({
        start_date: startDate,
        end_date: endDate,
        hotel_id: hotelId
      }).eq("id", targetVisitId);
      await supabase.from("visit_clients").update({
        room_number: roomNumber
      }).eq("id", editingVisit.id);
    }

    if (targetVisitId) {
      const companionsToAdd = selectedCompanions.filter(
        c => !initialCompanions.some(ic => ic.id === c.id)
      );
      const companionsToRemove = initialCompanions.filter(
        ic => !selectedCompanions.some(c => c.id === ic.id)
      );

      if (companionsToAdd.length > 0) {
        await supabase.from("visit_clients").insert(
          companionsToAdd.map(c => ({
            visit_id: targetVisitId,
            client_id: c.id,
            room_number: roomNumber
          }))
        );
      }

      if (companionsToRemove.length > 0) {
        await supabase.from("visit_clients")
          .delete()
          .eq("visit_id", targetVisitId)
          .in("client_id", companionsToRemove.map(c => c.id));
      }
    }

    setIsSavingVisit(false);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">
            {mode === 'add' ? 'Add New Visit' : 'Edit Visit'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          <form id="visit-form" onSubmit={handleSaveVisit} className="flex flex-col gap-6">
            {hasOverlap && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-md flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="text-sm font-semibold text-red-800">Date Overlap Detected</h3>
                  <p className="text-sm text-red-700 mt-1">This diver already has a visit scheduled during these dates. Please adjust the dates to continue.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Check-in Date *</label>
                <input type="date" name="start_date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Check-out Date *</label>
                <input type="date" name="end_date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hotel</label>
                <select name="hotel_id" defaultValue={editingVisit?.visits?.hotel_id || ""} className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  <option value="">Select Hotel</option>
                  {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Room Number</label>
                <input type="text" name="room_number" defaultValue={editingVisit?.room_number || ""} className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>
          </form>

          {/* Companions Section */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Traveling Companions</h3>

            {selectedCompanions.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {selectedCompanions.map(comp => (
                  <span key={comp.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-xs font-medium">
                    {comp.first_name} {comp.last_name}
                    <button onClick={() => handleRemoveCompanion(comp.id)} className="hover:bg-blue-200 rounded-full p-0.5 transition-colors" title="Remove">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {showCreateCompanion ? (
              <form onSubmit={handleQuickCreateCompanion} className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col gap-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Create Diver</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input name="first_name" placeholder="First Name *" required className="w-full px-3 py-2 text-sm border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" autoFocus />
                  <input name="last_name" placeholder="Last Name *" required className="w-full px-3 py-2 text-sm border rounded-md border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                {/* FIX 2: inline email error for quick-create companion */}
                <div>
                  <input
                    name="email"
                    type="email"
                    placeholder="Email Address (Optional)"
                    onChange={() => companionEmailError && setCompanionEmailError(null)}
                    className={`w-full px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none ${
                      companionEmailError ? "border-red-400 bg-red-50" : "border-slate-300"
                    }`}
                  />
                  {companionEmailError && (
                    <p className="mt-1 text-xs text-red-600">{companionEmailError}</p>
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <button type="button" onClick={() => { setShowCreateCompanion(false); setCompanionEmailError(null); }} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">Cancel</button>
                  <button type="submit" disabled={isCreating} className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition-colors disabled:opacity-70">
                    {isCreating ? "Saving..." : "Save & Add"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex gap-2 relative" ref={searchRef}>
                <input
                  type="text"
                  placeholder="Search to add companion..."
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.trim()) setShowDropdown(true);
                    else setShowDropdown(false);
                  }}
                  onFocus={() => searchQuery.trim() && setShowDropdown(true)}
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => setShowCreateCompanion(true)}
                  className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md text-sm font-medium shadow-sm transition-colors whitespace-nowrap"
                >
                  + New
                </button>

                {showDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-[calc(100%-4.5rem)] bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden z-50">
                    {isSearching ? (
                      <div className="p-3 text-center text-xs text-slate-500">Searching...</div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500">No matching divers found.</div>
                    ) : (
                      <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {searchResults.map(client => (
                          <li key={client.id}>
                            <button
                              type="button"
                              onClick={() => handleAddCompanion(client)}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors flex justify-between items-center"
                            >
                              <div>
                                <p className="text-sm font-medium text-slate-800">{client.first_name} {client.last_name}</p>
                                <p className="text-[10px] text-slate-500">{client.email || 'No email'}</p>
                              </div>
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
        </div>

        <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">Cancel</button>
          <button
            type="submit"
            form="visit-form"
            disabled={isSavingVisit || hasOverlap}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSavingVisit ? "Saving..." : "Save Visit"}
          </button>
        </div>
      </div>
    </div>
  );
}