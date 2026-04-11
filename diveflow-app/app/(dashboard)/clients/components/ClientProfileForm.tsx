import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

interface ClientProfileFormProps {
  selectedClient: any;
  certLevels: any[];
  certOrgs: any[];
  onClose: () => void;
  onUpdate: (updatedClient: any) => void;
}

export default function ClientProfileForm({
  selectedClient,
  certLevels,
  certOrgs,
  onClose,
  onUpdate,
}: ClientProfileFormProps) {
  const supabase = createClient();
  const [isSaving, setIsSaving] = useState(false);
  const [requiresVisit, setRequiresVisit] = useState<boolean>(selectedClient.requires_visit ?? true);
  const [globalProfile, setGlobalProfile] = useState<any | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Determine the source of truth for global metadata (Passport vs Local DB)
  const isOnline = !!selectedClient.user_id;

  useEffect(() => {
    async function loadGlobalProfile() {
      if (!isOnline) {
        setGlobalProfile(null);
        return;
      }
      setIsLoadingProfile(true);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", selectedClient.user_id)
        .single();
      
      setGlobalProfile(data);
      setIsLoadingProfile(false);
    }
    loadGlobalProfile();
  }, [selectedClient.user_id, isOnline, supabase]);

  // Derived display data prioritizes Global Passport if they are online
  const displayData = isOnline && globalProfile ? { ...selectedClient, ...globalProfile } : selectedClient;

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    
    const formData = new FormData(e.currentTarget);

    // Global Fields
    const globalUpdates = {
      phone: formData.get("phone") || null,
      address_street: formData.get("address_street") || null,
      address_city: formData.get("address_city") || null,
      address_zip: formData.get("address_zip") || null,
      address_country: formData.get("address_country") || null,
      cert_organization: formData.get("cert_organization") || null,
      cert_level: formData.get("cert_level") || null,
      cert_number: formData.get("cert_number") || null,
      nitrox_cert_number: formData.get("nitrox_cert_number") || null,
      emergency_contact_name: formData.get("emergency_contact_name") || null,
      emergency_contact_phone: formData.get("emergency_contact_phone") || null,
      last_dive_date: formData.get("last_dive_date") || null,
    };

    // Strict Local Fields (Dive center ownership)
    const localUpdates = {
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      email: formData.get("email") || null,
      notes: formData.get("notes"),
      requires_visit: formData.get("requires_visit") === "true",
    };

    let errorOccurred = false;

    // 1. Write the Local Fields inherently
    // If they are offline, write everything to `clients` directly for fallback compatibility.
    const finalClientUpdates = isOnline ? localUpdates : { ...localUpdates, ...globalUpdates };

    const { error: clientError } = await supabase
      .from("clients")
      .update(finalClientUpdates)
      .eq("id", selectedClient.id);
    
    if (clientError) {
       console.error("Local save error:", clientError);
       errorOccurred = true;
    }

    // 2. Write the Global Fields to their Passport
    if (isOnline && !errorOccurred) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update(globalUpdates)
        .eq("id", selectedClient.user_id);

      if (profileError) {
         console.error("Global save error:", profileError);
         errorOccurred = true;
      } else {
         setGlobalProfile({ ...globalProfile, ...globalUpdates });
      }
    }

    setIsSaving(false);

    if (!errorOccurred) {
      onUpdate({ ...selectedClient, ...finalClientUpdates });
    } else {
      alert("Could not save all changes. Check your permissions and connection.");
    }
  };

  return (
    <div className="w-full lg:w-6/12 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-auto lg:h-[calc(100vh-6rem)] overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 shrink-0">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 truncate">
            {displayData.first_name} {displayData.last_name}
            {displayData.cert_level && (
              <span 
                title={displayData.nitrox_cert_number ? `Nitrox Cert: ${displayData.nitrox_cert_number}` : "Standard Air"}
                className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border shrink-0 ${
                  displayData.nitrox_cert_number?.trim() 
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}
              >
                {certLevels.find((c: any) => c.id === displayData.cert_level)?.abbreviation || displayData.cert_level}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-normal text-slate-500 px-2 py-0.5 border border-slate-200 bg-white rounded-md shrink-0">
              #{selectedClient.client_number}
            </span>
            {isOnline ? (
               <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center gap-1">
                 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 Global Passport Synced
               </span>
            ) : (
               <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 border border-slate-200 text-slate-500">
                 Offline Local Client
               </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 mt-1">
          <Link
            href={`/pos/tabs?clientId=${selectedClient.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-colors"
            title="Open client tab in POS"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            View Tab
          </Link>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {isLoadingProfile ? (
        <div className="flex-1 flex items-center justify-center bg-slate-50/50">
          <svg className="animate-spin h-6 w-6 text-teal-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : (
        <form key={selectedClient.id + (globalProfile ? "-global" : "-local")} onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col relative">
          
          <div className="p-6 flex flex-col gap-8 pb-20">
            {/* Core Identification */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Client Identity</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">First Name</label>
                  <input name="first_name" defaultValue={displayData.first_name} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Last Name</label>
                  <input name="last_name" defaultValue={displayData.last_name} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1 flex justify-between">
                     Email
                     {isOnline && <span className="text-[9px] text-indigo-500 font-bold tracking-wide uppercase">Auth Locked</span>}
                  </label>
                  <input name="email" type="email" defaultValue={displayData.email || ""} disabled={isOnline} className={`w-full px-3 py-2 border border-slate-200 rounded-md outline-none text-sm shadow-sm ${isOnline ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500'}`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                  <input name="phone" defaultValue={displayData.phone || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm" />
                </div>
              </div>
            </div>

            {/* Global Qualifications */}
            <div className={`p-4 -mx-4 rounded-xl border ${isOnline ? 'bg-indigo-50/30 border-indigo-100/50' : 'bg-transparent border-transparent'}`}>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100/50 pb-2 flex items-center gap-2">
                 Qualifications
                 {isOnline && <span className="text-[9px] text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Writes to Global Passport</span>}
              </h3>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Organization</label>
                  <select name="cert_organization" defaultValue={displayData.cert_organization || ""} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-sm text-slate-700 shadow-sm">
                    <option value="">Select Organization</option>
                    {certOrgs.map((org: any) => (
                      <option key={org.id} value={org.name}>{org.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Level</label>
                  <select name="cert_level" defaultValue={displayData.cert_level || ""} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-sm text-slate-700 shadow-sm">
                    <option value="">No Certification Listed</option>
                    <optgroup label="Recreational">
                      {certLevels.filter((l: any) => !l.is_professional).map((l: any) => (
                        <option key={l.id} value={l.id}>{l.name} ({l.abbreviation})</option>
                      ))}
                    </optgroup>
                    <optgroup label="Professional">
                      {certLevels.filter((l: any) => l.is_professional).map((l: any) => (
                        <option key={l.id} value={l.id}>{l.name} ({l.abbreviation}) ✦</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cert Number</label>
                  <input name="cert_number" defaultValue={displayData.cert_number || ""} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-emerald-700 mb-1">Nitrox Cert Number</label>
                  <input name="nitrox_cert_number" defaultValue={displayData.nitrox_cert_number || ""} className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-md focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm font-mono text-emerald-800" />
                </div>
              </div>
              <div className="md:col-span-2 mt-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Global Date of Last Dive</label>
                <input name="last_dive_date" type="date" defaultValue={displayData.last_dive_date || ""} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm" />
              </div>
            </div>

            {/* Safety & Logistics */}
            <div className={`p-4 -mx-4 rounded-xl border ${isOnline ? 'bg-indigo-50/30 border-indigo-100/50' : 'bg-transparent border-transparent'}`}>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100/50 pb-2">Location & Safety</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Emergency Contact</label>
                  <input name="emergency_contact_name" defaultValue={displayData.emergency_contact_name || ""} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm placeholder:text-slate-300" placeholder="Contact Name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Emergency Phone</label>
                  <input name="emergency_contact_phone" defaultValue={displayData.emergency_contact_phone || ""} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm" />
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">Street</label>
                <input name="address_street" defaultValue={displayData.address_street || ""} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                  <input name="address_city" defaultValue={displayData.address_city || ""} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ZIP / Postal</label>
                  <input name="address_zip" defaultValue={displayData.address_zip || ""} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
                  <input name="address_country" defaultValue={displayData.address_country || ""} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm" />
                </div>
              </div>
            </div>

            {/* Local Private Notes */}
            <div className="p-4 -mx-4 rounded-xl border bg-amber-50/30 border-amber-100/50">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-amber-100/50 pb-2 flex items-center gap-2">
                Local Center Properties
                <span className="text-[9px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Private to your Shop</span>
              </h3>
              
              {/* Hidden field carries the toggle value into FormData */}
              <input type="hidden" name="requires_visit" value={String(requiresVisit)} />

              {/* Visit requirement toggle */}
              <div className={`mb-4 p-3 rounded-xl border transition-colors ${requiresVisit ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">
                      {requiresVisit ? 'Requires visit booking' : 'Local resident / walk-in'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {requiresVisit
                        ? 'Must have an active visit to join trips. Removed from trips when visit is deleted.'
                        : 'Can join any trip without a visit. Ideal for local divers.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRequiresVisit(v => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${requiresVisit ? 'bg-blue-500' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${requiresVisit ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Internal Notes</label>
                <textarea name="notes" defaultValue={displayData.notes || ""} rows={3} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md focus:ring-2 focus:ring-teal-500 outline-none text-sm shadow-sm" placeholder="Any special requirements or internal observances..."></textarea>
              </div>
            </div>

          </div>

          <div className="p-4 border-t border-slate-100 flex justify-end shrink-0 sticky bottom-0 bg-white/80 backdrop-blur-sm">
            <button type="submit" disabled={isSaving} className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-70 flex items-center gap-2">
              {isSaving ? "Syncing..." : "Update Identity"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}