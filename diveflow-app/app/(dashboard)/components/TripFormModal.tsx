'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';

interface TripFormModalProps {
  isOpen: boolean;
  mode: 'add' | 'edit';
  selectedDate?: string;   // pre-fills the date field in add mode
  selectedTime?: string;   // pre-fills the start time (HH:MM) in add mode
  tripData?: any;          // full trip row for edit mode
  onClose: () => void;
  onSuccess: () => void;   // called after a successful save
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toLocalDateStr(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns the Monday of the week that contains dateStr (Mon-based weeks). */
function getMondayOf(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay(); // 0 = Sun
  const delta = dow === 0 ? -6 : 1 - dow;
  return new Date(y, m - 1, d + delta);
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── RepeatDayPicker ───────────────────────────────────────────────────────────

const DOW_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function RepeatDayPicker({
  anchorDate,
  selectedDays,
  onToggle,
  conflicts,
}: {
  anchorDate: string;
  selectedDays: string[];
  onToggle: (date: string) => void;
  conflicts: Record<string, any>;
}) {
  // 3 weeks starting from Monday of the anchor date's week
  const monday = getMondayOf(anchorDate);
  const weeks = [0, 1, 2].map(w =>
    [0, 1, 2, 3, 4, 5, 6].map(d => {
      const date = new Date(monday.getTime() + (w * 7 + d) * 86_400_000);
      return toDateStr(date);
    })
  );

  return (
    <div>
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_LABELS.map(l => (
          <div key={l} className="text-center text-[10px] font-medium text-slate-400">{l}</div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
          {week.map(dateStr => {
            const isSelected  = selectedDays.includes(dateStr);
            const hasConflict = !!conflicts[dateStr];
            const dayNum      = Number(dateStr.split('-')[2]);
            const monthIdx    = new Date(dateStr).getMonth();

            let cellCls = 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600';
            if (isSelected && hasConflict)  cellCls = 'bg-red-50 border-red-400 text-red-700';
            else if (isSelected)            cellCls = 'bg-teal-500 border-teal-500 text-white';
            else if (hasConflict)           cellCls = 'bg-red-50 border-red-200 text-red-400';

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => onToggle(dateStr)}
                className={`relative flex flex-col items-center justify-center h-9 rounded-md text-xs font-medium transition-colors border ${cellCls}`}
              >
                <span>{dayNum}</span>
                {dayNum === 1 && (
                  <span className={`text-[8px] leading-none ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                    {MONTH_SHORT[monthIdx]}
                  </span>
                )}
                {/* Red dot for conflicts on unselected days */}
                {hasConflict && !isSelected && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-400" />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── TripFormModal ─────────────────────────────────────────────────────────────

export default function TripFormModal({
  isOpen,
  mode,
  selectedDate,
  selectedTime,
  tripData,
  onClose,
  onSuccess,
}: TripFormModalProps) {
  const supabase = createClient();

  // ── Reference data ────────────────────────────────────────────────────────
  const [orgId,     setOrgId]     = useState<string | null>(null);
  const [vessels,   setVessels]   = useState<any[]>([]);
  const [tripTypes, setTripTypes] = useState<any[]>([]);

  // ── Controlled form fields ────────────────────────────────────────────────
  const [formDate,     setFormDate]     = useState('');
  const [formTime,     setFormTime]     = useState('08:00');
  const [formDuration, setFormDuration] = useState(240);
  const [formCapacity, setFormCapacity] = useState(14);
  const [formVesselId, setFormVesselId] = useState('');

  // ── Repeat state (add mode only) ──────────────────────────────────────────
  const [isRepeat,   setIsRepeat]   = useState(false);
  const [repeatDays, setRepeatDays] = useState<string[]>([]);

  // ── Conflict state ────────────────────────────────────────────────────────
  // Single-day mode
  const [conflictTrip, setConflictTrip] = useState<any>(null);
  // Repeat mode: date → conflicting trip
  const [dayConflicts, setDayConflicts] = useState<Record<string, any>>({});

  const [isCheckingConflict, setIsCheckingConflict] = useState(false);
  const [isSaving,           setIsSaving]           = useState(false);

  // Any selected day that has a conflict blocks the whole batch
  const hasConflictInSelection = useMemo(
    () => isRepeat ? repeatDays.some(d => dayConflicts[d]) : !!conflictTrip,
    [isRepeat, repeatDays, dayConflicts, conflictTrip]
  );

  // ── Load org + reference data on mount ────────────────────────────────────
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
        supabase.from('vessels').select('id, name, capacity')
          .eq('organization_id', profile.organization_id).order('name'),
        supabase.from('trip_types').select('*')
          .eq('organization_id', profile.organization_id).order('default_start_time'),
      ]);

      if (vData) setVessels(vData);
      if (tData) setTripTypes(tData);
    }
    load();
  }, []);

  // ── Reset fields when modal opens ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setConflictTrip(null);
    setDayConflicts({});
    setIsRepeat(false);
    setRepeatDays([]);

    if (mode === 'edit' && tripData) {
      const d = new Date(tripData.start_time);
      setFormDate(toLocalDateStr(tripData.start_time));
      setFormTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      setFormDuration(tripData.duration_minutes);
      setFormCapacity(tripData.max_divers ?? 14);
      setFormVesselId(tripData.vessel_id ?? '');
    } else if (mode === 'add') {
      const date = selectedDate ?? '';
      setFormDate(date);
      if (selectedTime) {
        setFormTime(selectedTime);
        if (tripTypes.length > 0) setFormDuration(tripTypes[0].number_of_dives * 120);
      } else if (tripTypes.length > 0) {
        setFormTime(tripTypes[0].default_start_time.substring(0, 5));
        setFormDuration(tripTypes[0].number_of_dives * 120);
      }
      setFormCapacity(14);
      setFormVesselId('');
    }
  }, [isOpen, mode, tripData, tripTypes, selectedDate, selectedTime]);

  // ── Toggle repeat mode ────────────────────────────────────────────────────
  const handleToggleRepeat = (on: boolean) => {
    setIsRepeat(on);
    setConflictTrip(null);
    setDayConflicts({});
    if (on) {
      // Seed with the currently selected date
      setRepeatDays(formDate ? [formDate] : []);
    } else {
      // Restore single date to the first selected day (or formDate)
      if (repeatDays.length > 0) setFormDate(repeatDays[0]);
      setRepeatDays([]);
    }
  };

  const handleToggleDay = (dateStr: string) => {
    setRepeatDays(prev =>
      prev.includes(dateStr)
        ? prev.filter(d => d !== dateStr)
        : [...prev, dateStr].sort()
    );
  };

  // ── Unified conflict check ────────────────────────────────────────────────
  useEffect(() => {
    if (!formVesselId || !formTime || !orgId) {
      setConflictTrip(null);
      setDayConflicts({});
      return;
    }

    const daysToCheck = isRepeat ? repeatDays : (formDate ? [formDate] : []);
    if (daysToCheck.length === 0) {
      setConflictTrip(null);
      setDayConflicts({});
      return;
    }

    let cancelled = false;

    async function checkConflicts() {
      setIsCheckingConflict(true);

      const [hours, minutes] = formTime.split(':').map(Number);

      const windows = daysToCheck.map(dateStr => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const start = new Date(y, m - 1, d, hours, minutes);
        const end   = new Date(start.getTime() + formDuration * 60_000);
        return { dateStr, start, end };
      });

      // Single broad query covering all days
      const minStart = new Date(Math.min(...windows.map(w => w.start.getTime())) - 12 * 3_600_000);
      const maxEnd   = new Date(Math.max(...windows.map(w => w.end.getTime())));

      const { data } = await supabase
        .from('trips')
        .select('id, label, start_time, duration_minutes, trip_types(name)')
        .eq('vessel_id', formVesselId)
        .eq('organization_id', orgId)
        .gte('start_time', minStart.toISOString())
        .lte('start_time', maxEnd.toISOString());

      if (cancelled || !data) { setIsCheckingConflict(false); return; }

      if (isRepeat) {
        const newConflicts: Record<string, any> = {};
        for (const { dateStr, start, end } of windows) {
          const hit = data.find(t => {
            if (t.id === tripData?.id) return false;
            const es = new Date(t.start_time).getTime();
            const ee = es + t.duration_minutes * 60_000;
            return start.getTime() < ee && end.getTime() > es;
          });
          if (hit) newConflicts[dateStr] = hit;
        }
        setDayConflicts(newConflicts);
        setConflictTrip(null);
      } else {
        const { start, end } = windows[0];
        const conflict = data.find(t => {
          if (t.id === tripData?.id) return false;
          const es = new Date(t.start_time).getTime();
          const ee = es + t.duration_minutes * 60_000;
          return start.getTime() < ee && end.getTime() > es;
        });
        setConflictTrip(conflict ?? null);
        setDayConflicts({});
      }

      setIsCheckingConflict(false);
    }

    checkConflicts();
    return () => { cancelled = true; };
  }, [isRepeat, repeatDays, formVesselId, formDate, formTime, formDuration, orgId]);

  // ── Field change handlers ─────────────────────────────────────────────────
  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = tripTypes.find(t => t.id === e.target.value);
    if (t) {
      setFormTime(t.default_start_time.substring(0, 5));
      setFormDuration(t.number_of_dives * 120);
    }
  };

  const handleVesselChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = vessels.find(v => v.id === e.target.value);
    setFormVesselId(e.target.value);
    if (v) setFormCapacity(v.capacity);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orgId || hasConflictInSelection) return;
    setIsSaving(true);

    const fd = new FormData(e.currentTarget);
    const [hours, minutes] = formTime.split(':').map(Number);

    const basePayload = {
      organization_id:  orgId,
      label:            (fd.get('label') as string) || null,
      trip_type_id:     fd.get('trip_type_id'),
      entry_mode:       fd.get('entry_mode'),
      duration_minutes: Number(fd.get('duration_minutes')),
      max_divers:       Number(fd.get('max_divers')),
      vessel_id:        (fd.get('vessel_id') as string) || null,
    };

    let error: any = null;

    if (isRepeat && mode === 'add') {
      // Batch insert — all trips share a series_id
      const seriesId = crypto.randomUUID();
      const inserts = repeatDays.map(dateStr => {
        const [y, m, d] = dateStr.split('-').map(Number);
        return {
          ...basePayload,
          start_time: new Date(y, m - 1, d, hours, minutes).toISOString(),
          series_id: seriesId,
        };
      });
      ({ error } = await supabase.from('trips').insert(inserts));
    } else {
      const dateStr = fd.get('date') as string;
      const [year, month, day] = dateStr.split('-').map(Number);
      const payload = {
        ...basePayload,
        start_time: new Date(year, month - 1, day, hours, minutes).toISOString(),
      };
      ({ error } =
        mode === 'add'
          ? await supabase.from('trips').insert(payload)
          : await supabase.from('trips').update(payload).eq('id', tripData.id));
    }

    setIsSaving(false);

    if (error) {
      if (error.message.includes('vessel_overlap')) {
        alert('One or more trips conflict with an existing vessel booking. Please adjust the vessel or time.');
      } else {
        alert('Error saving trip: ' + error.message);
      }
      return;
    }

    onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  // Conflicting selected days for the summary banner
  const conflictingSelectedDays = isRepeat
    ? repeatDays.filter(d => dayConflicts[d])
    : [];

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

          {/* Trip type + entry mode */}
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

          {/* Date / repeat section */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">
                {isRepeat ? 'Select Days *' : 'Date *'}
              </label>

              {/* Repeat toggle — only in add mode */}
              {mode === 'add' && (
                <button
                  type="button"
                  onClick={() => handleToggleRepeat(!isRepeat)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    isRepeat
                      ? 'bg-teal-50 border-teal-300 text-teal-700'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-teal-300 hover:text-teal-600'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {isRepeat ? 'Repeat on' : 'Repeat'}
                </button>
              )}
            </div>

            {isRepeat ? (
              /* ── Multi-day picker ── */
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                <RepeatDayPicker
                  anchorDate={formDate || toDateStr(new Date())}
                  selectedDays={repeatDays}
                  onToggle={handleToggleDay}
                  conflicts={dayConflicts}
                />
                <p className="mt-2 text-xs text-slate-400 text-center">
                  {repeatDays.length === 0
                    ? 'Tap days to select'
                    : `${repeatDays.length} day${repeatDays.length > 1 ? 's' : ''} selected`}
                </p>
              </div>
            ) : (
              /* ── Single date input ── */
              <input
                type="date"
                name="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            )}
          </div>

          {/* Start time + duration (always visible) */}
          <div className="grid grid-cols-2 gap-4">
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

          {/* Label + capacity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Custom Label</label>
              <input
                type="text"
                name="label"
                placeholder="e.g. Special Wreck Run"
                defaultValue={tripData?.label || ''}
                className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
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
          </div>

          {/* Vessel selector + conflict feedback */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assign Vessel</label>
            <select
              name="vessel_id"
              value={formVesselId}
              onChange={handleVesselChange}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-teal-500 outline-none bg-white transition-colors ${
                hasConflictInSelection ? 'border-red-400 bg-red-50' : 'border-slate-300'
              }`}
            >
              <option value="">No Vessel (Shore Dive)</option>
              {vessels.map(v => (
                <option key={v.id} value={v.id}>{v.name} (Cap: {v.capacity})</option>
              ))}
            </select>

            {/* Availability feedback */}
            {isCheckingConflict && (
              <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Checking availability…
              </p>
            )}

            {/* Single-day conflict */}
            {!isCheckingConflict && !isRepeat && conflictTrip && (
              <p className="mt-1.5 text-xs text-red-600 flex items-start gap-1.5 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5">
                <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <span>
                  Vessel already booked at <strong>{formatTime(conflictTrip.start_time)}</strong>
                  {conflictTrip.trip_types?.name ? ` · ${conflictTrip.trip_types.name}` : ''}.
                  Choose a different vessel or adjust the time.
                </span>
              </p>
            )}

            {/* Repeat-mode conflict summary */}
            {!isCheckingConflict && isRepeat && conflictingSelectedDays.length > 0 && (
              <div className="mt-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-1.5">
                <p className="flex items-center gap-1.5 font-medium mb-1">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  Vessel conflict on {conflictingSelectedDays.length} selected day{conflictingSelectedDays.length > 1 ? 's' : ''}:
                </p>
                <ul className="ml-5 space-y-0.5">
                  {conflictingSelectedDays.map(d => {
                    const c = dayConflicts[d];
                    const label = new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    return (
                      <li key={d}>
                        <strong>{label}</strong> — booked at {formatTime(c.start_time)}
                        {c.trip_types?.name ? ` · ${c.trip_types.name}` : ''}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1 text-red-500">Deselect conflicting days or choose a different vessel.</p>
              </div>
            )}

            {/* All clear */}
            {!isCheckingConflict && !hasConflictInSelection && formVesselId &&
             (isRepeat ? repeatDays.length > 0 : formDate) && formTime && (
              <p className="mt-1 text-xs text-teal-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {isRepeat
                  ? `Vessel available on all ${repeatDays.length} selected day${repeatDays.length > 1 ? 's' : ''}`
                  : 'Vessel is available at this time'}
              </p>
            )}
          </div>

          {/* Actions */}
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
              disabled={
                isSaving ||
                isCheckingConflict ||
                hasConflictInSelection ||
                (isRepeat && repeatDays.length === 0)
              }
              className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSaving
                ? 'Saving…'
                : isRepeat
                  ? `Create ${repeatDays.length} Trip${repeatDays.length !== 1 ? 's' : ''}`
                  : mode === 'add' ? 'Create Trip' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
