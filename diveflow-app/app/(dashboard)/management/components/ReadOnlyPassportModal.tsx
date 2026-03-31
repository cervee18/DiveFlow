"use client";

import { useEffect, useState } from "react";
import { getReadOnlyPassport } from "../actions";

interface ReadOnlyPassportModalProps {
  userId: string;
  onClose: () => void;
}

export default function ReadOnlyPassportModal({ userId, onClose }: ReadOnlyPassportModalProps) {
  const [passport, setPassport] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPassport() {
      setIsLoading(true);
      const res = await getReadOnlyPassport(userId);
      if (res && res.error) {
        setErrorMessage(res.error);
      } else if (res && res.data) {
        setPassport(res.data);
      }
      setIsLoading(false);
    }
    fetchPassport();
  }, [userId]);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg shadow-sm border border-indigo-200">
               {passport ? (passport.first_name?.charAt(0) || "") + (passport.last_name?.charAt(0) || "") : "?"}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Global Passport View 
                <span className="text-[9px] uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">Read-Only</span>
              </h2>
              <p className="text-xs text-slate-500">Previewing global metadata before importing</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {isLoading ? (
            <div className="h-40 flex items-center justify-center">
              <svg className="animate-spin h-6 w-6 text-indigo-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : errorMessage ? (
             <div className="text-center py-10 text-rose-500 font-mono text-sm max-w-md mx-auto">
                <p className="font-bold mb-2">Database Rejection:</p>
                {errorMessage}
             </div>
          ) : !passport ? (
             <div className="text-center py-10 text-slate-500">
                Could not load Global Passport. State unknown.
             </div>
          ) : (
            <div className="space-y-8">
               
               {/* Contact Block */}
               <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                     <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                     Identity
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <div className="text-[10px] text-slate-400 font-semibold mb-0.5 uppercase tracking-wide">First Name</div>
                        <div className="text-sm font-medium text-slate-800">{passport.first_name || "—"}</div>
                     </div>
                     <div>
                        <div className="text-[10px] text-slate-400 font-semibold mb-0.5 uppercase tracking-wide">Last Name</div>
                        <div className="text-sm font-medium text-slate-800">{passport.last_name || "—"}</div>
                     </div>
                     <div>
                        <div className="text-[10px] text-slate-400 font-semibold mb-0.5 uppercase tracking-wide">Email Linked</div>
                        <div className="text-sm font-medium text-slate-800">{passport.email || "—"}</div>
                     </div>
                     <div>
                        <div className="text-[10px] text-slate-400 font-semibold mb-0.5 uppercase tracking-wide">My Phone</div>
                        <div className="text-sm font-medium text-slate-800">{passport.phone || "—"}</div>
                     </div>
                  </div>
               </div>

               {/* Qualifications Block */}
               <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 shadow-sm">
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                     <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                     Qualifications
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <div className="text-[10px] text-indigo-400 font-semibold mb-0.5 uppercase tracking-wide">Agency</div>
                        <div className="text-sm font-medium text-slate-800">{passport.cert_organization || "—"}</div>
                     </div>
                     <div>
                        <div className="text-[10px] text-indigo-400 font-semibold mb-0.5 uppercase tracking-wide">Highest Level</div>
                        <div className="text-sm font-medium text-slate-800">
                           {passport.cert_level_name ? `${passport.cert_level_name} (${passport.cert_level_abbr})` : "—"}
                        </div>
                     </div>
                     <div>
                        <div className="text-[10px] text-indigo-400 font-semibold mb-0.5 uppercase tracking-wide">Number</div>
                        <div className="text-sm font-medium text-slate-800 font-mono">{passport.cert_number || "—"}</div>
                     </div>
                     <div>
                        <div className="text-[10px] text-emerald-600 font-semibold mb-0.5 uppercase tracking-wide">Nitrox / Enriched Air Number</div>
                        <div className="text-sm font-medium text-emerald-700 font-mono">{passport.nitrox_cert_number || "—"}</div>
                     </div>
                     <div className="col-span-2 pt-2 border-t border-indigo-100/60 mt-2">
                        <div className="text-[10px] text-indigo-400 font-semibold mb-0.5 uppercase tracking-wide">Global Currency (Last Dive)</div>
                        <div className="text-sm font-medium text-slate-800">{passport.last_dive_date ? new Date(passport.last_dive_date).toLocaleDateString() : "—"}</div>
                     </div>
                  </div>
               </div>

               {/* Safety Block */}
               <div className="bg-red-50/50 p-5 rounded-xl border border-red-100 shadow-sm">
                  <h3 className="text-xs font-bold text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                     <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                     Emergency & Billing Location
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <div className="text-[10px] text-red-400 font-semibold mb-0.5 uppercase tracking-wide">Emergency Contact</div>
                        <div className="text-sm font-medium text-slate-800">{passport.emergency_contact_name || "—"}</div>
                     </div>
                     <div>
                        <div className="text-[10px] text-red-400 font-semibold mb-0.5 uppercase tracking-wide">Emergency Phone</div>
                        <div className="text-sm font-medium text-slate-800">{passport.emergency_contact_phone || "—"}</div>
                     </div>
                     <div className="col-span-2 pt-2 border-t border-red-100/60 mt-2">
                        <div className="text-[10px] text-red-400 font-semibold mb-0.5 uppercase tracking-wide">Billing Address</div>
                        <div className="text-sm font-medium text-slate-800 mt-1">
                           {passport.address_street || passport.address_city || passport.address_country ? (
                              <>
                                <div>{passport.address_street}</div>
                                <div>{passport.address_city}, {passport.address_zip}</div>
                                <div>{passport.address_country}</div>
                              </>
                           ) : "—"}
                        </div>
                     </div>
                  </div>
               </div>

            </div>
          )}
        </div>
        
        <div className="p-4 bg-white border-t border-slate-100 flex justify-end">
           <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors">
              Close Preview
           </button>
        </div>

      </div>
    </div>
  );
}
