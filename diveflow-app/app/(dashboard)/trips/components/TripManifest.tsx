'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import AddDiverModal from './AddDiverModal';

export default function TripManifest({ tripId, tripDate }: { tripId: string, tripDate: string }) {
  const supabase = createClient();
  const [manifest, setManifest] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const [pendingChanges, setPendingChanges] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!tripId) return;
    setIsLoading(true);

    const { data: manifestData, error: manifestError } = await supabase
      .from('trip_clients')
      .select(`
        *,
        clients ( 
          first_name, 
          last_name, 
          last_dive_date,
          certification_levels!cert_level ( abbreviation )
        ),
        courses ( name )
      `)
      .eq('trip_id', tripId)
      .order('id', { ascending: true });

    if (manifestError) {
      console.error("Error fetching manifest:", manifestError);
    }

    const { data: catData } = await supabase
      .from('equipment_categories')
      .select('name, sizes');

    if (manifestData) setManifest(manifestData);
    if (catData) setCategories(catData);
    setIsLoading(false);
  }, [tripId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleChange = (id: string, field: string, value: any) => {
    setPendingChanges(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value }
    }));
  };

  const handleSave = async () => {
    if (Object.keys(pendingChanges).length === 0) return;
    setIsSaving(true);
    
    const promises = Object.entries(pendingChanges).map(([id, changes]) => 
      supabase.from('trip_clients').update(changes).eq('id', id)
    );

    const results = await Promise.all(promises);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      alert("Error saving some changes. Check the console.");
      console.error(errors);
    } else {
      setPendingChanges({});
      await fetchData(); 
    }
    setIsSaving(false);
  };

  const getSizesFor = (name: string) => {
    return categories.find(c => c.name.toLowerCase() === name.toLowerCase())?.sizes || [];
  };

  // Helper to format date as M/YY
  const formatLastDive = (dateString: string) => {
    const d = new Date(dateString);
    return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
  };

  return (
    <div className="flex-1 flex flex-col mt-4 relative">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Diver Manifest</h3>
          <p className="text-[10px] text-slate-500 uppercase">Interactive Sheet • Changes autosave on 'Enter'</p>
        </div>
        
        <div className="flex items-center gap-3">
          {Object.keys(pendingChanges).length > 0 && (
            <>
              <span className="text-[10px] font-bold text-amber-600 uppercase animate-pulse">Unsaved Changes</span>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-all flex items-center gap-2"
              >
                {isSaving ? 'Saving...' : 'Save All Changes'}
              </button>
            </>
          )}
<button 
  onClick={() => setIsAddModalOpen(true)} // <-- Add this onClick
  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2"
>
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
  Add Diver
</button>
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse text-[11px] whitespace-nowrap min-w-max">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-tighter">
              <th className="px-3 py-3 border-r sticky left-0 bg-slate-50 z-20 shadow-[1px_0_0_0_#e2e8f0]">Diver Name</th>
              <th className="px-2 py-3 text-center border-r">Waiver</th>
              <th className="px-2 py-3 text-center border-r">Dep.</th>
              {/* Changed Pick Up to be a narrower, centered column for the checkbox */}
              <th className="px-2 py-3 text-center border-r">Pick Up</th>
              <th className="px-3 py-3 border-r">Last Dive</th>
              <th className="px-3 py-3 border-r">Cert</th>
              <th className="px-2 py-3 text-center border-r bg-blue-50/30">BCD</th>
              <th className="px-2 py-3 text-center border-r bg-blue-50/30">Suit</th>
              <th className="px-2 py-3 text-center border-r bg-blue-50/30">Fins</th>
              <th className="px-2 py-3 text-center border-r bg-blue-50/30">Mask</th>
              <th className="px-2 py-3 text-center border-r">Reg</th>
              <th className="px-2 py-3 text-center border-r">Comp</th>
              <th className="px-4 py-3 text-center border-r">Gas</th>
              <th className="px-3 py-3 w-48">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && manifest.length === 0 ? (
              <tr><td colSpan={14} className="py-10 text-center text-slate-400">Loading divers...</td></tr>
            ) : manifest.length === 0 ? (
              <tr><td colSpan={14} className="py-10 text-center text-slate-400 italic">No divers assigned to this trip.</td></tr>
            ) : (
              manifest.map((diver) => {
                const rowChanges = pendingChanges[diver.id] || {};
                const isModified = !!pendingChanges[diver.id];

                return (
                  <tr key={diver.id} className={`${isModified ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'} transition-colors`}>
                    <td className={`px-3 py-2 font-bold text-slate-900 border-r sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0] ${isModified ? 'bg-amber-50' : 'bg-white'}`}>
                      {diver.clients?.first_name} {diver.clients?.last_name}
                    </td>

                    {/* Admin Toggles */}
                    <td className="px-2 py-2 border-r text-center">
                      <input 
                        type="checkbox" 
                        checked={rowChanges.waiver ?? diver.waiver ?? false} 
                        onChange={e => handleChange(diver.id, 'waiver', e.target.checked)} 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                      />
                    </td>
                    <td className="px-2 py-2 border-r text-center">
                      <input 
                        type="checkbox" 
                        checked={rowChanges.deposit ?? diver.deposit ?? false} 
                        onChange={e => handleChange(diver.id, 'deposit', e.target.checked)} 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                      />
                    </td>
                    {/* Pick Up Checkbox */}
                    <td className="px-2 py-2 border-r text-center">
                      <input 
                        type="checkbox" 
                        checked={rowChanges.pick_up ?? diver.pick_up ?? false} 
                        onChange={e => handleChange(diver.id, 'pick_up', e.target.checked)} 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                      />
                    </td>

                    {/* Last Dive (Formatted) & Cert */}
                    <td className="px-3 py-2 border-r text-slate-500 font-medium">
                      {diver.clients?.last_dive_date 
                        ? formatLastDive(diver.clients.last_dive_date)
                        : <span className="text-amber-600">New</span>}
                    </td>
                    <td className="px-3 py-2 border-r font-bold text-slate-700">
                      {diver.courses?.name ? (
                        <span className="text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded text-[10px]">
                          {diver.courses.name}
                        </span>
                      ) : (
                        diver.clients?.certification_levels?.abbreviation || 'OW'
                      )}
                    </td>

                    {/* Equipment Dropdowns */}
                    {['bcd', 'wetsuit', 'fins', 'mask'].map(gear => (
                      <td key={gear} className="px-1 py-1 border-r bg-blue-50/10 hover:bg-white transition-colors">
                        <select 
                          value={rowChanges[gear] ?? diver[gear] ?? ''} 
                          onChange={e => handleChange(diver.id, gear, e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded text-[10px] font-bold text-slate-700 cursor-pointer appearance-none text-center"
                        >
                          <option value="">-</option>
                          {getSizesFor(gear).map((s: string) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    ))}

                    {/* Boolean Equipment */}
                    <td className="px-2 py-2 border-r text-center">
                      <input 
                        type="checkbox" 
                        checked={rowChanges.regulator ?? diver.regulator ?? false} 
                        onChange={e => handleChange(diver.id, 'regulator', e.target.checked)} 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                      />
                    </td>
                    <td className="px-2 py-2 border-r text-center">
                      <input 
                        type="checkbox" 
                        checked={rowChanges.computer ?? diver.computer ?? false} 
                        onChange={e => handleChange(diver.id, 'computer', e.target.checked)} 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" 
                      />
                    </td>

                    {/* Gas Inline */}
                    <td className="px-2 py-1 border-r">
                      <div className="flex items-center gap-2 justify-center">
                         <input 
                           type="checkbox" 
                           checked={rowChanges.nitrox ?? diver.nitrox ?? false} 
                           onChange={e => handleChange(diver.id, 'nitrox', e.target.checked)} 
                           className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                         />
                         {(rowChanges.nitrox ?? diver.nitrox) ? (
                           <input 
                             type="number" 
                             value={rowChanges.nitrox_percentage ?? diver.nitrox_percentage ?? 32} 
                             onChange={e => handleChange(diver.id, 'nitrox_percentage', parseInt(e.target.value))}
                             className="w-10 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-0.5 text-center focus:ring-1 focus:ring-emerald-500"
                           />
                         ) : (
                           <span className="w-10 text-[10px] text-slate-300 text-center">Air</span>
                         )}
                      </div>
                    </td>

                    {/* Notes */}
                    <td className="px-2 py-1">
                      <input 
                        type="text" 
                        value={rowChanges.notes ?? diver.notes ?? ''} 
                        onChange={e => handleChange(diver.id, 'notes', e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSave()}
                        placeholder="Add note..."
                        className="w-full min-w-[150px] bg-transparent border-none focus:ring-1 focus:ring-blue-500 px-2 py-1 text-slate-500 italic placeholder:text-slate-300 rounded"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <AddDiverModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        tripId={tripId}
        tripDate={tripDate}
        onSuccess={() => {
          fetchData(); // Refresh the manifest table instantly
          setIsAddModalOpen(false); // Close the modal
        }}
      />
    </div>
  );
}