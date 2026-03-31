"use client";

import { useState } from "react";
import { updateGlobalProfile } from "../actions";

export default function ProfileForm({ profile, userAuth, certOrgs, certLevels }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const meta = userAuth?.user_metadata || {};
  const firstName = meta.first_name || "";
  const lastName = meta.last_name || "";

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    const result = await updateGlobalProfile(formData);

    if (result.error) {
      setMessage({ text: result.error, type: "error" });
    } else {
      setMessage({ text: "Profile updated successfully!", type: "success" });
      setTimeout(() => setMessage(null), 3000);
    }
    setIsSaving(false);
  };

  return (
    <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      
      {/* Absolute Identity Details */}
      <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row gap-8 items-start">
        <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white shadow-lg shrink-0 flex items-center justify-center text-3xl font-bold text-slate-300">
           {firstName.charAt(0)}{lastName.charAt(0)}
        </div>
        
        <div className="w-full flex-1 pt-2">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Global Passport</h1>
              <p className="text-sm text-slate-500 mt-1">
                Your universal diver identity across the DiveFlow network.
              </p>
            </div>
            {message && (
               <div className={`px-4 py-2 rounded-md text-sm font-semibold transition-opacity ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                 {message.text}
               </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
             <div>
               <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">First Name</label>
               <input name="first_name" defaultValue={firstName} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none transition-all shadow-sm" />
             </div>
             <div>
               <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Last Name</label>
               <input name="last_name" defaultValue={lastName} required className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none transition-all shadow-sm" />
             </div>
             <div className="md:col-span-2">
               <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Email Identity</label>
               <input value={userAuth.email} disabled className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 text-slate-400 rounded-lg cursor-not-allowed shadow-inner" />
               <p className="text-[10px] text-slate-400 mt-1">Identity emails cannot be changed directly.</p>
             </div>
          </div>
        </div>
      </div>

      {/* Driver Qualifications */}
      <div className="p-8 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-6 flex items-center gap-2">
           <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
           Diver Qualifications
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Certification Agency</label>
            <select name="cert_organization" defaultValue={profile.cert_organization || ""} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm">
              <option value="">Select Organization</option>
              {certOrgs.map((org: any) => (
                <option key={org.id} value={org.name}>{org.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Highest Level</label>
            <select name="cert_level" defaultValue={profile.cert_level || ""} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm">
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
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Certification Number</label>
            <input name="cert_number" defaultValue={profile.cert_number || ""} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm font-mono text-sm" placeholder="e.g. 1912XXXX" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-emerald-700 mb-1.5">Nitrox Certified? (Enriched Air Number)</label>
            <input name="nitrox_cert_number" defaultValue={profile.nitrox_cert_number || ""} className="w-full px-4 py-2.5 bg-white border border-emerald-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-emerald-800 shadow-sm font-mono text-sm placeholder:text-emerald-200" placeholder="e.g. 2101XXXX" />
          </div>
          <div className="md:col-span-2 border-t border-slate-200/60 pt-6 mt-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Global Date of Last Dive</label>
            <input name="last_dive_date" type="date" defaultValue={profile.last_dive_date || ""} className="w-full md:w-1/2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm" />
            <p className="text-[10px] text-slate-400 mt-1.5">Tracking your currency helps Dive Centers ensure your safety.</p>
          </div>
        </div>
      </div>

      {/* Safety & Logistics */}
      <div className="p-8">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-6 flex items-center gap-2">
           <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
           Safety & Billing Location
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* Emergency */}
           <div className="flex flex-col gap-4">
              <div className="p-4 bg-red-50 rounded-lg border border-red-100 mb-2">
                 <p className="text-xs text-red-700 font-medium">This contact will be accessed globally by any Dive Center you go on a trip with.</p>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Emergency Contact Name</label>
                <input name="emergency_contact_name" defaultValue={profile.emergency_contact_name || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Emergency Contact Phone</label>
                <input name="emergency_contact_phone" defaultValue={profile.emergency_contact_phone || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">My Personal Phone</label>
                <input name="phone" defaultValue={profile.phone || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm" />
              </div>
           </div>

           {/* Address */}
           <div className="flex flex-col gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 mb-2">
                 <p className="text-xs text-blue-700 font-medium">Your global billing address. Useful for quick digital waivers.</p>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Street Address</label>
                <input name="address_street" defaultValue={profile.address_street || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-xs font-semibold text-slate-600 mb-1.5">City</label>
                   <input name="address_city" defaultValue={profile.address_city || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm" />
                 </div>
                 <div>
                   <label className="block text-xs font-semibold text-slate-600 mb-1.5">Zip/Postal</label>
                   <input name="address_zip" defaultValue={profile.address_zip || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm" />
                 </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Country</label>
                <input name="address_country" defaultValue={profile.address_country || ""} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none text-slate-700 shadow-sm" />
              </div>
           </div>
        </div>
      </div>

      <div className="px-8 py-5 bg-slate-100 border-t border-slate-200 flex justify-end">
        <button 
           type="submit" 
           disabled={isSaving}
           className="bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 text-white font-bold py-2.5 px-8 rounded-lg shadow-md transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {isSaving ? "Saving Identity..." : "Commit Global Passport"}
        </button>
      </div>
    </form>
  );
}
