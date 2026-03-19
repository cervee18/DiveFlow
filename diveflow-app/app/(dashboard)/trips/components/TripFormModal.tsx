import { useState, useEffect } from 'react';

export default function TripFormModal({ 
  isOpen, 
  mode, 
  tripData, 
  vessels, 
  tripTypes, 
  selectedDate, 
  onClose, 
  onSave, 
  isSaving 
}: any) {
  const [formTime, setFormTime] = useState("08:00");
  const [formDuration, setFormDuration] = useState(240);
  const [formCapacity, setFormCapacity] = useState(14);

  // Set initial form values when modal opens
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && tripData) {
        const d = new Date(tripData.start_time);
        setFormTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        setFormDuration(tripData.duration_minutes);
        setFormCapacity(tripData.max_divers || 14);
      } else if (mode === 'add' && tripTypes.length > 0) {
        setFormTime(tripTypes[0].default_start_time.substring(0, 5));
        setFormDuration(tripTypes[0].number_of_dives * 120);
        setFormCapacity(14);
      }
    }
  }, [isOpen, mode, tripData, tripTypes]);

  const handleVesselChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedVessel = vessels.find((v: any) => v.id === e.target.value);
    if (selectedVessel) setFormCapacity(selectedVessel.capacity);
  };

  if (!isOpen) return null;

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedType = tripTypes.find((t: any) => t.id === selectedId);
    if (selectedType) {
      setFormTime(selectedType.default_start_time.substring(0, 5));
      setFormDuration(selectedType.number_of_dives * 120); 
    }
  };

  const getLocalDateString = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-full">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-800">
            {mode === 'add' ? 'Schedule New Trip' : 'Edit Trip'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={onSave} className="p-6 flex flex-col gap-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Trip Type *</label>
              <select 
                name="trip_type_id" 
                defaultValue={tripData?.trip_type_id || (tripTypes.length > 0 ? tripTypes[0].id : "")} 
                onChange={handleTypeChange}
                required
                className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
              >
                {tripTypes.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Entry Mode *</label>
              <select 
                name="entry_mode" 
                defaultValue={tripData?.entry_mode || "Boat"} 
                className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
              >
                <option value="Boat">Boat</option>
                <option value="Shore">Shore</option>
                <option value="Both">Both</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
              <input 
                type="date" 
                name="date" 
                defaultValue={mode === 'edit' ? getLocalDateString(tripData.start_time) : selectedDate} 
                required 
                className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Start Time *</label>
              <input 
                type="time" 
                name="time" 
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
                required 
                className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none" 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Custom Label (Optional)</label>
            <input 
              type="text" 
              name="label" 
              placeholder="e.g. Special Wreck Run"
              defaultValue={tripData?.label || ""} 
              className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Capacity *</label>
              <input
                type="number"
                name="max_divers"
                value={formCapacity}
                onChange={e => setFormCapacity(Number(e.target.value))}
                required
                className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duration (mins) *</label>
              <input 
                type="number" 
                name="duration_minutes" 
                value={formDuration}
                onChange={(e) => setFormDuration(Number(e.target.value))}
                required 
                className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none" 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign Vessel</label>
            <select
              name="vessel_id"
              defaultValue={tripData?.vessel_id || ""}
              onChange={handleVesselChange}
              className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
            >
              <option value="">No Vessel (Shore Dive)</option>
              {vessels.map((v: any) => (
                <option key={v.id} value={v.id}>{v.name} (Cap: {v.capacity})</option>
              ))}
            </select>
          </div>

          <div className="pt-4 mt-2 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors">Cancel</button>
            <button type="submit" disabled={isSaving} className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-70">
              {isSaving ? "Saving..." : mode === 'add' ? "Create Trip" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}