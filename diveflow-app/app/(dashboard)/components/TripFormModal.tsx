'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

interface TripFormModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  selectedDate?: string;   // pre-fills the date field in add mode
  tripData?: any;          // full trip row for edit mode
  onClose: () => void;
  onSuccess: () => void;   // called after a successful save
}

export default function TripFormModal({
  isOpen,
  mode,
  selectedDate,
  tripData,
  onClose,
  onSuccess,
}: TripFormModalProps) {
  const supabase = createClient();

  // Reference data — fetched once, shared across open/close cycles
  const [orgId,     setOrgId]     = useState<string | null>(null);
  const [vessels,   setVessels]   = useState<any[]>([]);
  const [tripTypes, setTripTypes] = useState<any[]>([]);

  // Controlled form fields that depend on trip-type / vessel selection
  const [formTime,     setFormTime]     = useState('08:00');
  const [formDuration, setFormDuration] = useState(240);
  const [formCapacity, setFormCapacity] = useState(14);
  const [isSaving,     setIsSaving]     = useState(false);

  // Load org + reference data on mount
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();
      if (!profile?.organization_id) return;

      setOrgId(profile.organization_id);

      const [{ data: vData }, { data: tData }] = await Promise.all([
        supabase
          .from('vessels')
          .select('id, name, capacity')
          .eq('organization_id', profile.organization_id)
          .order('name'),
        supabase
          .from('trip_types')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .order('default_start_time'),
      ]);

      if (vData) setVessels(vData);
      if (tData) setTripTypes(tData);
    }
    load();
  }, []);

  // Reset controlled fields when the modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && tripData) {
      const d = new Date(tripData.start_time);
      setFormTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      setFormDuration(tripData.duration_minutes);
      setFormCapacity(tripData.max_divers ?? 14);
    } else if (mode === 'add' && tripTypes.length > 0) {
      setFormTime(tripTypes[0].default_start_time.substring(0, 5));
      setFormDuration(tripTypes[0].number_of_dives * 120);
      setFormCapacity(14);
    }
  }, [isOpen, mode, tripData, tripTypes]);

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = tripTypes.find(t => t.id === e.target.value);
    if (t) {
      setFormTime(t.default_start_time.substring(0, 5));
      setFormDuration(t.number_of_dives * 120);
    }
  };

  const handleVesselChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = vessels.find(v => v.id === e.target.value);
    if (v) setFormCapacity(v.capacity);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orgId) return;
    setIsSaving(true);

    const fd = new FormData(e.currentTarget);
    const dateStr = fd.get('date') as string;
    const timeStr = fd.get('time') as string;
    const [year, month, day]   = dateStr.split('-').map(Number);
    const [hours, minutes]     = timeStr.split(':').map(Number);

    const payload = {
      organization_id:  orgId,
      label:            (fd.get('label') as string) || null,
      trip_type_id:     fd.get('trip_type_id'),
      entry_mode:       fd.get('entry_mode'),
      start_time:       new Date(year, month - 1, day, hours, minutes).toISOString(),
      duration_minutes: Number(fd.get('duration_minutes')),
      max_divers:       Number(fd.get('max_divers')),
      vessel_id:        (fd.get('vessel_id') as string) || null,
    };

    const { error } =
      mode === 'add'
        ? await supabase.from('trips').insert(payload)
        : await supabase.from('trips').update(payload).eq('id', tripData.id);

    setIsSaving(false);

    if (error) {
      alert('Error saving trip: ' + error.message);
      return;
    }

    onSuccess();
    onClose();
  };

  const toLocalDateStr = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-full">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-800">
            {mode === 'add' ? 'Schedule New Trip' : 'Edit Trip'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5 overflow-y-auto">

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Trip Type *</label>
              <select
                name="trip_type_id"
                defaultValue={tripData?.trip_type_id || (tripTypes[0]?.id ?? '')}
                onChange={handleTypeChange}
                required
                className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
              >
                {tripTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Entry Mode *</label>
              <select
                name="entry_mode"
                defaultValue={tripData?.entry_mode || 'Boat'}
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
                defaultValue={mode === 'edit' ? toLocalDateStr(tripData.start_time) : selectedDate}
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
                onChange={e => setFormTime(e.target.value)}
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
              defaultValue={tripData?.label || ''}
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
                onChange={e => setFormDuration(Number(e.target.value))}
                required
                className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign Vessel</label>
            <select
              name="vessel_id"
              defaultValue={tripData?.vessel_id || ''}
              onChange={handleVesselChange}
              className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
            >
              <option value="">No Vessel (Shore Dive)</option>
              {vessels.map(v => (
                <option key={v.id} value={v.id}>{v.name} (Cap: {v.capacity})</option>
              ))}
            </select>
          </div>

          <div className="pt-4 mt-2 border-t border-slate-100 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-70"
            >
              {isSaving ? 'Saving…' : mode === 'add' ? 'Create Trip' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
