'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

interface TripType {
  id: string;
  name: string;
  abbreviation: string | null;
  category: string | null;
  default_start_time_am: string;
  default_start_time_pm: string;
  number_of_dives: number;
  color: string | null;
  online_bookable: boolean;
  online_price_per_person: number | null;
}

interface FormState {
  name: string;
  abbreviation: string;
  category: string;
  default_start_time_am: string;
  default_start_time_pm: string;
  number_of_dives: string;
  color: string;
  online_price_per_person: string;
}

const CATEGORIES = ['Dive', 'Snorkel', 'Pool', 'Class'] as const;
const CATEGORY_ORDER = ['Dive', 'Snorkel', 'Pool', 'Class'];

// Must match OverviewTripCard's COLOR_MAP
const COLORS: { value: string; bg: string; ring: string }[] = [
  { value: 'blue',    bg: 'bg-blue-400',    ring: 'ring-blue-400'    },
  { value: 'teal',    bg: 'bg-teal-400',    ring: 'ring-teal-400'    },
  { value: 'sky',     bg: 'bg-sky-400',     ring: 'ring-sky-400'     },
  { value: 'cyan',    bg: 'bg-cyan-400',    ring: 'ring-cyan-400'    },
  { value: 'indigo',  bg: 'bg-indigo-400',  ring: 'ring-indigo-400'  },
  { value: 'purple',  bg: 'bg-purple-400',  ring: 'ring-purple-400'  },
  { value: 'emerald', bg: 'bg-emerald-400', ring: 'ring-emerald-400' },
  { value: 'amber',   bg: 'bg-amber-400',   ring: 'ring-amber-400'   },
  { value: 'orange',  bg: 'bg-orange-400',  ring: 'ring-orange-400'  },
  { value: 'rose',    bg: 'bg-rose-400',    ring: 'ring-rose-400'    },
];

const COLOR_DOT: Record<string, string> = Object.fromEntries(COLORS.map(c => [c.value, c.bg]));

function emptyForm(category = 'Dive'): FormState {
  return { name: '', abbreviation: '', category, default_start_time_am: '08:00', default_start_time_pm: '13:00', number_of_dives: '2', color: 'blue', online_price_per_person: '' };
}

function typeToForm(t: TripType): FormState {
  return {
    name:                    t.name,
    abbreviation:            t.abbreviation ?? '',
    category:                t.category ?? 'Dive',
    default_start_time_am:   t.default_start_time_am.slice(0, 5),
    default_start_time_pm:   t.default_start_time_pm.slice(0, 5),
    number_of_dives:         String(t.number_of_dives),
    color:                   t.color ?? 'blue',
    online_price_per_person: t.online_price_per_person != null ? String(t.online_price_per_person) : '',
  };
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const hour  = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  Dive:    'bg-blue-100 text-blue-700',
  Snorkel: 'bg-sky-100 text-sky-700',
  Pool:    'bg-cyan-100 text-cyan-700',
  Class:   'bg-purple-100 text-purple-700',
};

// ── Color swatch picker ───────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {COLORS.map(c => (
        <button
          key={c.value}
          type="button"
          title={c.value}
          onClick={() => onChange(c.value)}
          className={`w-5 h-5 rounded-full ${c.bg} transition-transform hover:scale-110 ${
            value === c.value ? `ring-2 ring-offset-1 ${c.ring}` : ''
          }`}
        />
      ))}
    </div>
  );
}

// ── Inline form row ───────────────────────────────────────────────────────────
function TripTypeFormRow({
  form,
  onChange,
  onSave,
  onCancel,
  isSaving,
  isNew,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isNew: boolean;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const set = (key: keyof FormState, val: string) => onChange({ ...form, [key]: val });
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSave();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className={`px-6 py-3 space-y-3 ${isNew ? 'bg-teal-50' : 'bg-slate-50'}`}>
      {/* Row 1: color, name, abbreviation, category */}
      <div className="flex items-center gap-3 flex-wrap">
        <ColorPicker value={form.color} onChange={v => set('color', v)} />

        <input
          ref={nameRef}
          value={form.name}
          onChange={e => set('name', e.target.value)}
          onKeyDown={onKey}
          placeholder="Type name"
          className="flex-1 min-w-[140px] text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
        />

        <input
          value={form.abbreviation}
          onChange={e => set('abbreviation', e.target.value)}
          onKeyDown={onKey}
          placeholder="Abbrev."
          maxLength={8}
          className="w-24 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
        />

        <select
          value={form.category}
          onChange={e => set('category', e.target.value)}
          className="text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Row 2: start time, dives, actions */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-400 whitespace-nowrap">AM start</label>
          <input
            type="time"
            value={form.default_start_time_am}
            onChange={e => set('default_start_time_am', e.target.value)}
            className="text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-400 whitespace-nowrap">PM start</label>
          <input
            type="time"
            value={form.default_start_time_pm}
            onChange={e => set('default_start_time_pm', e.target.value)}
            className="text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-400 whitespace-nowrap">Dives</label>
          <input
            type="number"
            min={0}
            max={10}
            value={form.number_of_dives}
            onChange={e => set('number_of_dives', e.target.value)}
            onKeyDown={onKey}
            className="w-16 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-400 whitespace-nowrap">Online price / person</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.online_price_per_person}
            onChange={e => set('online_price_per_person', e.target.value)}
            onKeyDown={onKey}
            placeholder="—"
            className="w-24 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={onSave}
            disabled={isSaving || !form.name.trim() || !form.default_start_time_am || !form.default_start_time_pm}
            className="px-3 py-1.5 text-xs font-semibold bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Read-only row ─────────────────────────────────────────────────────────────
function TripTypeRow({
  type,
  onEdit,
  onDelete,
  onToggleOnlineBookable,
  isDeleting,
  isTogglingOnline,
}: {
  type: TripType;
  onEdit: () => void;
  onDelete: () => void;
  onToggleOnlineBookable: () => void;
  isDeleting: boolean;
  isTogglingOnline: boolean;
}) {
  const dotCls = COLOR_DOT[type.color ?? 'blue'] ?? 'bg-blue-400';
  const catCls  = CATEGORY_COLORS[type.category ?? ''] ?? 'bg-slate-100 text-slate-500';

  return (
    <div className="group flex items-center gap-3 px-6 py-3 hover:bg-slate-50 transition-colors">
      {/* Color dot */}
      <span className={`w-3 h-3 rounded-full shrink-0 ${dotCls}`} />

      {/* Name + abbreviation */}
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="font-medium text-slate-800 truncate">{type.name}</span>
        {type.abbreviation && (
          <span className="text-xs text-slate-400 shrink-0">({type.abbreviation})</span>
        )}
      </div>

      {/* Category badge */}
      <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${catCls}`}>
        {type.category ?? '—'}
      </span>

      {/* Default times */}
      <span className="text-xs text-slate-400 shrink-0 text-right">
        {formatTime(type.default_start_time_am)}
        <span className="text-slate-300 mx-1">/</span>
        {formatTime(type.default_start_time_pm)}
      </span>

      {/* Dives */}
      <span className="text-xs text-slate-400 shrink-0 w-12 text-right">
        {type.number_of_dives} {type.number_of_dives === 1 ? 'dive' : 'dives'}
      </span>

      {/* Online bookable toggle + price — always visible */}
      <div className="shrink-0 flex items-center gap-1.5">
        {type.online_bookable && type.online_price_per_person != null && (
          <span className="text-xs text-teal-600 font-medium tabular-nums">
            ${type.online_price_per_person.toFixed(2)}
          </span>
        )}
        <button
          onClick={onToggleOnlineBookable}
          disabled={isTogglingOnline}
          title={type.online_bookable ? 'Online booking enabled — click to disable' : 'Enable online booking'}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-40 ${
            type.online_bookable
              ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
              : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
          }`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253" />
          </svg>
          {type.online_bookable ? 'Online' : 'Offline'}
        </button>
      </div>

      {/* Edit / delete */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onEdit}
          title="Edit"
          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          title="Delete"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
        >
          {isDeleting ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Category group header ─────────────────────────────────────────────────────
function CategoryHeader({ label, count }: { label: string; count: number }) {
  const cls = CATEGORY_COLORS[label] ?? 'bg-slate-100 text-slate-500';
  return (
    <div className="flex items-center gap-2 px-6 py-2 bg-slate-50 border-b border-slate-100">
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
      <span className="text-[11px] text-slate-400">{count} {count === 1 ? 'type' : 'types'}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TripTypesConfig({ orgId }: { orgId: string }) {
  const supabase = createClient();

  const [types,           setTypes]           = useState<TripType[]>([]);
  const [isLoading,       setIsLoading]       = useState(true);
  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [editForm,        setEditForm]        = useState<FormState>(emptyForm());
  const [addForm,         setAddForm]         = useState<FormState | null>(null);
  const [isSaving,        setIsSaving]        = useState(false);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);
  const [togglingOnlineId, setTogglingOnlineId] = useState<string | null>(null);
  const [error,           setError]           = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('trip_types')
      .select('id, name, abbreviation, category, default_start_time_am, default_start_time_pm, number_of_dives, color, online_bookable, online_price_per_person')
      .eq('organization_id', orgId)
      .order('name')
      .then(({ data, error }) => {
        if (data) setTypes(data);
        if (error) setError(error.message);
        setIsLoading(false);
      });
  }, [orgId]);

  const startEdit = (t: TripType) => {
    setAddForm(null);
    setEditingId(t.id);
    setEditForm(typeToForm(t));
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setIsSaving(true);
    setError(null);
    const patch = {
      name:                    editForm.name.trim(),
      abbreviation:            editForm.abbreviation.trim() || null,
      category:                editForm.category,
      default_start_time_am:   editForm.default_start_time_am,
      default_start_time_pm:   editForm.default_start_time_pm,
      number_of_dives:         parseInt(editForm.number_of_dives, 10),
      color:                   editForm.color,
      online_price_per_person: editForm.online_price_per_person ? parseFloat(editForm.online_price_per_person) : null,
    };
    const { error } = await supabase.from('trip_types').update(patch).eq('id', editingId);
    if (error) { setError(error.message); setIsSaving(false); return; }
    setTypes(prev => prev.map(t => t.id === editingId ? { ...t, ...patch } : t));
    setEditingId(null);
    setIsSaving(false);
  };

  const handleAdd = async () => {
    if (!addForm) return;
    setIsSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from('trip_types')
      .insert({
        organization_id:         orgId,
        name:                    addForm.name.trim(),
        abbreviation:            addForm.abbreviation.trim() || null,
        category:                addForm.category,
        default_start_time_am:   addForm.default_start_time_am,
        default_start_time_pm:   addForm.default_start_time_pm,
        number_of_dives:         parseInt(addForm.number_of_dives, 10),
        color:                   addForm.color,
        online_price_per_person: addForm.online_price_per_person ? parseFloat(addForm.online_price_per_person) : null,
      })
      .select('id, name, abbreviation, category, default_start_time_am, default_start_time_pm, number_of_dives, color, online_bookable, online_price_per_person')
      .single();
    if (error) { setError(error.message); setIsSaving(false); return; }
    if (data) setTypes(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setAddForm(null);
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    const { error } = await supabase.from('trip_types').delete().eq('id', id);
    if (error) { setError(error.message); setDeletingId(null); return; }
    setTypes(prev => prev.filter(t => t.id !== id));
    setDeletingId(null);
  };

  const handleToggleOnlineBookable = async (id: string, current: boolean) => {
    setTogglingOnlineId(id);
    setError(null);
    const { error } = await supabase
      .from('trip_types')
      .update({ online_bookable: !current })
      .eq('id', id);
    if (error) { setError(error.message); setTogglingOnlineId(null); return; }
    setTypes(prev => prev.map(t => t.id === id ? { ...t, online_bookable: !current } : t));
    setTogglingOnlineId(null);
  };

  // Group types by category in fixed order
  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    items: types.filter(t => (t.category ?? '') === cat),
  })).filter(g => g.items.length > 0 || (addForm?.category === g.cat));

  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Block header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Trip Types</h2>
          <p className="text-xs text-slate-400 mt-0.5">Types of trips offered, grouped by category</p>
        </div>
        {!addForm && (
          <button
            onClick={() => { setEditingId(null); setAddForm(emptyForm()); setError(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add type
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-6 py-2 bg-rose-50 border-b border-rose-100 text-xs text-rose-600">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="divide-y divide-slate-100">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 px-6 py-3">
              <div className="w-3 h-3 rounded-full bg-slate-100 animate-pulse" />
              <div className="flex-1 h-4 bg-slate-100 animate-pulse rounded" />
              <div className="w-16 h-4 bg-slate-100 animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div>
          {types.length === 0 && !addForm && (
            <div className="px-6 py-8 text-center text-sm text-slate-400">
              No trip types yet — add your first one above.
            </div>
          )}

          {CATEGORY_ORDER.map(cat => {
            const items = types.filter(t => (t.category ?? '') === cat);
            const isAddingHere = addForm?.category === cat;
            if (items.length === 0 && !isAddingHere) return null;
            return (
              <div key={cat} className="border-t border-slate-100 first:border-t-0">
                <CategoryHeader label={cat} count={items.length} />
                <div className="divide-y divide-slate-100">
                  {items.map(t =>
                    editingId === t.id ? (
                      <TripTypeFormRow
                        key={t.id}
                        form={editForm}
                        onChange={setEditForm}
                        onSave={handleSaveEdit}
                        onCancel={() => { setEditingId(null); setError(null); }}
                        isSaving={isSaving}
                        isNew={false}
                      />
                    ) : (
                      <TripTypeRow
                        key={t.id}
                        type={t}
                        onEdit={() => startEdit(t)}
                        onDelete={() => handleDelete(t.id)}
                        onToggleOnlineBookable={() => handleToggleOnlineBookable(t.id, t.online_bookable)}
                        isDeleting={deletingId === t.id}
                        isTogglingOnline={togglingOnlineId === t.id}
                      />
                    )
                  )}
                  {isAddingHere && (
                    <TripTypeFormRow
                      form={addForm!}
                      onChange={setAddForm}
                      onSave={handleAdd}
                      onCancel={() => { setAddForm(null); setError(null); }}
                      isSaving={isSaving}
                      isNew
                    />
                  )}
                </div>
              </div>
            );
          })}

        </div>
      )}
    </section>
  );
}
