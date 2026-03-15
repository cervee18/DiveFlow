import { useState } from "react";
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

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    
    const formData = new FormData(e.currentTarget);
    
    // Fallback empty strings to null to prevent UUID and date type errors
    const updates = {
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      email: formData.get("email") || null,
      phone: formData.get("phone") || null,
      address_street: formData.get("address_street") || null,
      address_city: formData.get("address_city") || null,
      address_zip: formData.get("address_zip") || null,
      address_country: formData.get("address_country") || null,
      cert_organization: formData.get("cert_organization") || null,
      cert_level: formData.get("cert_level") || null, // <-- This fixes the empty string error
      cert_number: formData.get("cert_number") || null,
      nitrox_cert_number: formData.get("nitrox_cert_number") || null,
      last_dive_date: formData.get("last_dive_date") || null,
      notes: formData.get("notes") || null,
    };

    const { error } = await supabase.from("clients").update(updates).eq("id", selectedClient.id);
    setIsSaving(false);

    if (!error) {
      onUpdate({ ...selectedClient, ...updates });
    } else {
      alert("Error updating client: " + error.message);
    }
  };

  return (
    <div className="w-6/12 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-5 truncate">
          <span className="truncate">
            {selectedClient.first_name} {selectedClient.last_name}
          </span>
          <span className="font-normal text-slate-500 shrink-0">
            #{selectedClient.client_number}
          </span>
          {selectedClient.cert_level && (
            <span 
              title={selectedClient.nitrox_cert_number ? `Nitrox Cert: ${selectedClient.nitrox_cert_number}` : "Standard Air"}
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded border shrink-0 ${
                selectedClient.nitrox_cert_number?.trim() 
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                  : "bg-slate-100 text-slate-500 border-slate-200"
              }`}
            >
              {/* Changed c.name to c.id in the find method below */}
              {certLevels.find(c => c.id === selectedClient.cert_level)?.abbreviation || "CERT"}
            </span>
          )}
        </h2>
        <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800 font-medium shrink-0">
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
              <input name="email" type="email" defaultValue={selectedClient.email || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
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
              <select name="cert_organization" defaultValue={selectedClient.cert_organization || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700">
                <option value="">Select Organization</option>
                {certOrgs.map(org => (
                  <option key={org.id} value={org.name}>{org.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Level</label>
              <select name="cert_level" defaultValue={selectedClient.cert_level || ""} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-700">
                <option value="">No Certification Listed</option>
                <optgroup label="Recreational">
                  {certLevels.filter(l => !l.is_professional).map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.abbreviation})</option>
                  ))}
                </optgroup>
                <optgroup label="Professional">
                  {certLevels.filter(l => l.is_professional).map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.abbreviation}) ✦</option>
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
  );
}