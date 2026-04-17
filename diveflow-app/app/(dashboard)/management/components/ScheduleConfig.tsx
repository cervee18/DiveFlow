'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

// 0=Sun … 6=Sat (JS convention, matches day_of_week in DB)
const DAYS: { dow: number; label: string; short: string }[] = [
  { dow: 1, label: 'Monday',    short: 'Mon' },
  { dow: 2, label: 'Tuesday',   short: 'Tue' },
  { dow: 3, label: 'Wednesday', short: 'Wed' },
  { dow: 4, label: 'Thursday',  short: 'Thu' },
  { dow: 5, label: 'Friday',    short: 'Fri' },
  { dow: 6, label: 'Saturday',  short: 'Sat' },
  { dow: 0, label: 'Sunday',    short: 'Sun' },
];

interface Vessel   { id: string; name: string; abbreviation: string | null; capacity_dive: number; capacity_snorkel: number; }
interface TripType { id: string; name: string; abbreviation: string | null; color: string | null; category: string | null; default_start_time_am: string; default_start_time_pm: string; }

interface Slot {
  id: string;
  day_of_week: number;
  vessel_id: string;
  trip_type_id: string;
  start_time: string;  // "HH:MM:SS"
  valid_from: string;  // "YYYY-MM-DD"
  vessels:    Vessel;
  trip_types: TripType;
}

interface SlotForm {
  vessel_id:    string;
  trip_type_id: string;
  start_time:   string;
  valid_from:   string;
}

type TimeSection = 'am' | 'pm' | 'night';

const AM_END = 12;
const PM_END = 18;

function sectionForTime(timeStr: string): TimeSection {
  const h = parseInt(timeStr.split(':')[0], 10);
  if (h < AM_END) return 'am';
  if (h < PM_END) return 'pm';
  return 'night';
}

const DEFAULT_TIMES: Record<TimeSection, string> = { am: '08:00', pm: '13:00', night: '18:30' };

const SLOT_SELECT = 'id, day_of_week, vessel_id, trip_type_id, start_time, valid_from, vessels(id, name, abbreviation, capacity_dive, capacity_snorkel), trip_types(id, name, abbreviation, color, category, default_start_time_am, default_start_time_pm)' as const;

function vesselCapacity(vessel: Vessel | undefined, category?: string | null): number {
  if (!vessel) return 14;
  if (category === 'Snorkel') return vessel.capacity_snorkel ?? vessel.capacity_dive ?? 14;
  return vessel.capacity_dive ?? vessel.capacity_snorkel ?? 14;
}

function timeFromType(type: TripType | undefined, section: TimeSection): string {
  if (!type) return DEFAULT_TIMES[section];
  if (section === 'pm') return (type.default_start_time_pm ?? '13:00').slice(0, 5);
  return (type.default_start_time_am ?? '08:00').slice(0, 5);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Mirrors OverviewTripCard's COLOR_MAP
const COLOR_MAP: Record<string, { text: string; cardBg: string; cardBorder: string; cardHover: string }> = {
  teal:    { text: 'text-teal-700',    cardBg: 'bg-teal-50',    cardBorder: 'border-teal-200',    cardHover: 'hover:bg-teal-100'    },
  blue:    { text: 'text-blue-700',    cardBg: 'bg-blue-50',    cardBorder: 'border-blue-200',    cardHover: 'hover:bg-blue-100'    },
  purple:  { text: 'text-purple-700',  cardBg: 'bg-purple-50',  cardBorder: 'border-purple-200',  cardHover: 'hover:bg-purple-100'  },
  sky:     { text: 'text-sky-700',     cardBg: 'bg-sky-50',     cardBorder: 'border-sky-200',     cardHover: 'hover:bg-sky-100'     },
  indigo:  { text: 'text-indigo-700',  cardBg: 'bg-indigo-50',  cardBorder: 'border-indigo-200',  cardHover: 'hover:bg-indigo-100'  },
  amber:   { text: 'text-amber-700',   cardBg: 'bg-amber-50',   cardBorder: 'border-amber-200',   cardHover: 'hover:bg-amber-100'   },
  rose:    { text: 'text-rose-700',    cardBg: 'bg-rose-50',    cardBorder: 'border-rose-200',    cardHover: 'hover:bg-rose-100'    },
  emerald: { text: 'text-emerald-700', cardBg: 'bg-emerald-50', cardBorder: 'border-emerald-200', cardHover: 'hover:bg-emerald-100' },
  cyan:    { text: 'text-cyan-700',    cardBg: 'bg-cyan-50',    cardBorder: 'border-cyan-200',    cardHover: 'hover:bg-cyan-100'    },
  orange:  { text: 'text-orange-700',  cardBg: 'bg-orange-50',  cardBorder: 'border-orange-200',  cardHover: 'hover:bg-orange-100'  },
};
const FALLBACK = { text: 'text-teal-700', cardBg: 'bg-teal-50', cardBorder: 'border-teal-200', cardHover: 'hover:bg-teal-100' };
function accent(color: string | null) { return COLOR_MAP[(color ?? '').toLowerCase()] ?? FALLBACK; }

// ── Slot card (looks like OverviewTripCard) ────────────────────────────────────
function SlotCard({
  slot,
  onEdit,
  onDelete,
  isDeleting,
}: {
  slot: Slot;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const a = accent(slot.trip_types.color);
  const category   = (slot.trip_types.category ?? '').toLowerCase();
  const isNonWater = category === 'pool' || category === 'class';
  const vesselAbbr = slot.vessels.abbreviation ?? slot.vessels.name;
  const typeAbbr   = slot.trip_types.abbreviation ?? slot.trip_types.name;
  const leftLabel  = isNonWater ? typeAbbr : [vesselAbbr, typeAbbr].filter(Boolean).join(' ') || '—';

  return (
    <div className={`group/card relative w-full rounded-lg border overflow-hidden ${a.cardBg} ${a.cardBorder}`}>
      {/* Main row — click to edit */}
      <button
        onClick={onEdit}
        className={`w-full flex items-center gap-1 px-2 py-2.5 text-left ${a.cardHover} transition-colors`}
      >
        <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide leading-none ${a.text}`}>
          {leftLabel}
        </span>
        <span className="flex-1" />
        <span className={`text-[9px] tabular-nums font-semibold shrink-0 ${a.text} opacity-60`}>
          ({vesselCapacity(slot.vessels, slot.trip_types.category)})
        </span>
      </button>

      {/* Time row */}
      <div className={`px-2 pb-2 flex items-center justify-between`}>
        <span className={`text-[9px] font-medium ${a.text} opacity-50`}>
          {formatTime(slot.start_time)}
        </span>
        {slot.valid_from > todayStr() && (
          <span className="text-[8px] font-medium text-amber-500 opacity-80">
            from {slot.valid_from}
          </span>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute top-1 right-1 opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-0.5">
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          title="Edit"
          className="w-5 h-5 flex items-center justify-center rounded bg-white/80 hover:bg-white text-slate-500 hover:text-teal-600 transition-colors shadow-sm"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          disabled={isDeleting}
          title="Delete"
          className="w-5 h-5 flex items-center justify-center rounded bg-white/80 hover:bg-white text-slate-500 hover:text-rose-600 transition-colors shadow-sm disabled:opacity-40"
        >
          {isDeleting ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Add/Edit modal ────────────────────────────────────────────────────────────
function SlotModal({
  isNew,
  section,
  form,
  dow,
  vessels,
  tripTypes,
  onChange,
  onSave,
  onClose,
  isSaving,
  error,
}: {
  isNew: boolean;
  section: TimeSection;
  form: SlotForm;
  dow: number;
  vessels: Vessel[];
  tripTypes: TripType[];
  onChange: (f: SlotForm) => void;
  onSave: (selectedDays: number[]) => void;
  onClose: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  const firstRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  // Multi-day selection — only meaningful in add mode
  const [selectedDays, setSelectedDays] = useState<number[]>([dow]);
  const toggleDay = (d: number) =>
    setSelectedDays(prev =>
      prev.includes(d) ? (prev.length > 1 ? prev.filter(x => x !== d) : prev) : [...prev, d]
    );

  const set = (k: keyof SlotForm, v: string) => onChange({ ...form, [k]: v });
  const dayLabel = DAYS.find(d => d.dow === dow)?.label ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm mx-4 p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            {isNew ? 'Add slot' : `Edit slot — ${dayLabel}`}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="px-3 py-2 bg-rose-50 rounded-lg text-xs text-rose-600">{error}</div>
        )}

        <div className="space-y-3">

          {/* Day selector — add mode only */}
          {isNew && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">Days</label>
              <div className="flex gap-1">
                {DAYS.map(({ dow: d, short }) => {
                  const active = selectedDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(d)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                        active
                          ? 'bg-teal-500 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Trip type</label>
            <select
              ref={firstRef}
              value={form.trip_type_id}
              onChange={e => {
                const t = tripTypes.find(t => t.id === e.target.value);
                onChange(isNew
                  ? { ...form, trip_type_id: e.target.value, start_time: timeFromType(t, section) }
                  : { ...form, trip_type_id: e.target.value }
                );
              }}
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
            >
              <option value="">Select…</option>
              {tripTypes.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Vessel</label>
            <select
              value={form.vessel_id}
              onChange={e => set('vessel_id', e.target.value)}
              className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
            >
              <option value="">Select…</option>
              {vessels.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-slate-500">Start time</label>
              <input
                type="time"
                value={form.start_time}
                onChange={e => set('start_time', e.target.value)}
                className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-slate-500">Valid from</label>
              <input
                type="date"
                value={form.valid_from}
                onChange={e => set('valid_from', e.target.value)}
                className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selectedDays)}
            disabled={isSaving || !form.trip_type_id || !form.vessel_id || !form.start_time || (isNew && selectedDays.length === 0)}
            className="px-4 py-1.5 text-xs font-semibold bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving…' : isNew && selectedDays.length > 1 ? `Add to ${selectedDays.length} days` : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScheduleConfig({ orgId }: { orgId: string }) {
  const supabase = createClient();

  const [slots,      setSlots]      = useState<Slot[]>([]);
  const [vessels,    setVessels]    = useState<Vessel[]>([]);
  const [tripTypes,  setTripTypes]  = useState<TripType[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal state
  const [modalOpen,    setModalOpen]    = useState(false);
  const [modalIsNew,   setModalIsNew]   = useState(true);
  const [modalDow,     setModalDow]     = useState(1);
  const [modalSection, setModalSection] = useState<TimeSection>('am');
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [form,       setForm]       = useState<SlotForm>({ vessel_id: '', trip_type_id: '', start_time: '08:00', valid_from: todayStr() });
  const [isSaving,   setIsSaving]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [
        { data: sData, error: sErr },
        { data: vData },
        { data: tData },
      ] = await Promise.all([
        supabase
          .from('weekly_schedule_slots')
          .select(SLOT_SELECT)
          .eq('organization_id', orgId)
          .order('start_time'),
        supabase.from('vessels').select('id, name, abbreviation, capacity_dive, capacity_snorkel').eq('organization_id', orgId).order('name'),
        supabase.from('trip_types').select('id, name, abbreviation, color, category, default_start_time_am, default_start_time_pm').eq('organization_id', orgId).order('name'),
      ]);
      if (sErr) console.error(sErr);
      if (sData) setSlots(sData as any);
      if (vData) setVessels(vData);
      if (tData) setTripTypes(tData as any);
      setIsLoading(false);
    }
    load();
  }, [orgId]);

  const openAdd = (dow: number, section: TimeSection) => {
    setModalIsNew(true);
    setModalSection(section);
    setEditingId(null);
    setModalDow(dow);
    setForm({ vessel_id: vessels[0]?.id ?? '', trip_type_id: tripTypes[0]?.id ?? '', start_time: timeFromType(tripTypes[0], section), valid_from: todayStr() });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (slot: Slot) => {
    setModalIsNew(false);
    setEditingId(slot.id);
    setModalDow(slot.day_of_week);
    setForm({ vessel_id: slot.vessel_id, trip_type_id: slot.trip_type_id, start_time: slot.start_time.slice(0, 5), valid_from: slot.valid_from });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (selectedDays: number[]) => {
    setIsSaving(true);
    setError(null);

    if (modalIsNew) {
      // Batch-insert one record per selected day
      const rows = selectedDays.map(dow => ({
        organization_id: orgId,
        day_of_week:     dow,
        vessel_id:       form.vessel_id,
        trip_type_id:    form.trip_type_id,
        start_time:      form.start_time,
        valid_from:      form.valid_from,
      }));
      const { data, error } = await supabase
        .from('weekly_schedule_slots')
        .insert(rows)
        .select(SLOT_SELECT);
      if (error) { setError(error.message); setIsSaving(false); return; }
      if (data) setSlots(prev => [...prev, ...(data as any[])].sort((a, b) => a.start_time.localeCompare(b.start_time)));
    } else {
      const { error } = await supabase
        .from('weekly_schedule_slots')
        .update({ vessel_id: form.vessel_id, trip_type_id: form.trip_type_id, start_time: form.start_time, valid_from: form.valid_from })
        .eq('id', editingId!);
      if (error) { setError(error.message); setIsSaving(false); return; }
      const { data } = await supabase
        .from('weekly_schedule_slots')
        .select(SLOT_SELECT)
        .eq('id', editingId!)
        .single();
      if (data) setSlots(prev => prev.map(s => s.id === editingId ? (data as any) : s));
    }

    setIsSaving(false);
    setModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await supabase.from('weekly_schedule_slots').delete().eq('id', id);
    setSlots(prev => prev.filter(s => s.id !== id));
    setDeletingId(null);
  };

  // Card + section label heights for alignment (mirrors OverviewBoard)
  const CARD_H           = 64; // main row(40) + time row(24)
  const SECTION_LABEL_H  = 14;
  const GAP              = 4;

  const sectionHeight = (daySlots: Slot[], section: TimeSection) => {
    const cards = daySlots.filter(s => sectionForTime(s.start_time) === section);
    if (cards.length === 0) return 0;
    return SECTION_LABEL_H + cards.length * (CARD_H + GAP);
  };

  const maxAmHeight    = Math.max(0, ...DAYS.map(({ dow }) => sectionHeight(slots.filter(s => s.day_of_week === dow), 'am')));
  const maxPmHeight    = Math.max(0, ...DAYS.map(({ dow }) => sectionHeight(slots.filter(s => s.day_of_week === dow), 'pm')));

  return (
    <>
      <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">

        {/* Board */}
        <div className="flex-1 min-h-0 overflow-x-auto">
          <div className="min-w-max flex flex-col h-full">

            {/* Day headers */}
            <div className="flex shrink-0 border-b border-slate-200">
              {DAYS.map(({ dow, label, short }, i) => {
                const daySlots = slots.filter(s => s.day_of_week === dow);
                const colBg    = i % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                return (
                  <div key={dow} className={`w-44 border-r border-slate-200 last:border-r-0 px-3 py-3 ${colBg}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-700">{label}</span>
                      {daySlots.length > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500">
                          {daySlots.length}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cards area */}
            {isLoading ? (
              <div className="flex">
                {DAYS.map(({ dow }, i) => (
                  <div key={dow} className={`w-44 p-1.5 border-r border-slate-200 last:border-r-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <div className="h-16 bg-slate-100 animate-pulse rounded-lg" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 overflow-y-auto min-h-0">
                {DAYS.map(({ dow }, i) => {
                  const daySlots = slots.filter(s => s.day_of_week === dow);
                  const amSlots    = daySlots.filter(s => sectionForTime(s.start_time) === 'am');
                  const pmSlots    = daySlots.filter(s => sectionForTime(s.start_time) === 'pm');
                  const nightSlots = daySlots.filter(s => sectionForTime(s.start_time) === 'night');
                  const hasNight   = nightSlots.length > 0;
                  const colBg      = i % 2 === 0 ? 'bg-white' : 'bg-slate-50';

                  return (
                    <div key={dow} className={`group/col w-44 border-r border-slate-200 last:border-r-0 flex flex-col ${colBg}`}>
                      <div className="flex-1 p-1.5">

                        {/* AM */}
                        <div className="space-y-1" style={{ minHeight: maxAmHeight || undefined }}>
                          <div className="flex items-center justify-between px-1 pt-0.5">
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">Morning</span>
                            <button
                              type="button"
                              onClick={() => openAdd(dow, 'am')}
                              className="opacity-100 lg:opacity-0 lg:group-hover/col:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                          {amSlots.map(s => (
                            <SlotCard key={s.id} slot={s} onEdit={() => openEdit(s)} onDelete={() => handleDelete(s.id)} isDeleting={deletingId === s.id} />
                          ))}
                        </div>

                        {/* PM */}
                        <div className="space-y-1 mt-2" style={{ minHeight: maxPmHeight || undefined }}>
                          <div className={`flex items-center justify-between px-1 pt-0.5 ${maxAmHeight > 0 ? 'border-t border-slate-200 pt-2' : ''}`}>
                            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">Afternoon</span>
                            <button
                              type="button"
                              onClick={() => openAdd(dow, 'pm')}
                              className="opacity-100 lg:opacity-0 lg:group-hover/col:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                          {pmSlots.map(s => (
                            <SlotCard key={s.id} slot={s} onEdit={() => openEdit(s)} onDelete={() => handleDelete(s.id)} isDeleting={deletingId === s.id} />
                          ))}
                        </div>

                        {/* Night */}
                        {hasNight && (
                          <div className="space-y-1 mt-2">
                            <div className="flex items-center justify-between px-1 pt-0.5 border-t border-slate-200 pt-2">
                              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">Night</span>
                              <button
                                type="button"
                                onClick={() => openAdd(dow, 'night')}
                                className="opacity-100 lg:opacity-0 lg:group-hover/col:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50"
                              >
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                              </button>
                            </div>
                            {nightSlots.map(s => (
                              <SlotCard key={s.id} slot={s} onEdit={() => openEdit(s)} onDelete={() => handleDelete(s.id)} isDeleting={deletingId === s.id} />
                            ))}
                          </div>
                        )}

                        {/* Night add button (always visible when no night slots) */}
                        {!hasNight && (
                          <div className="mt-2 border-t border-slate-200 pt-2">
                            <div className="flex items-center justify-between px-1 pt-0.5">
                              <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">Night</span>
                              <button
                                type="button"
                                onClick={() => openAdd(dow, 'night')}
                                className="opacity-100 lg:opacity-0 lg:group-hover/col:opacity-100 transition-opacity w-3.5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-teal-600 hover:bg-teal-50"
                              >
                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                              </button>
                            </div>
                          </div>
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

      {/* Add/Edit modal */}
      {modalOpen && (
        <SlotModal
          isNew={modalIsNew}
          section={modalSection}
          form={form}
          dow={modalDow}
          vessels={vessels}
          tripTypes={tripTypes}
          onChange={setForm}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
          isSaving={isSaving}
          error={error}
        />
      )}
    </>
  );
}
