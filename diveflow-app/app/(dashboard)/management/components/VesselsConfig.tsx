'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';

interface Vessel {
  id: string;
  name: string;
  abbreviation: string | null;
  capacity_dive: number;
  capacity_snorkel: number;
  need_captain: boolean | null;
}

interface FormState {
  name: string;
  abbreviation: string;
  capacity_dive: string;
  capacity_snorkel: string;
  need_captain: boolean;
}

const emptyForm = (): FormState => ({
  name: '',
  abbreviation: '',
  capacity_dive: '',
  capacity_snorkel: '',
  need_captain: false,
});

function vesselToForm(v: Vessel): FormState {
  return {
    name:             v.name,
    abbreviation:     v.abbreviation ?? '',
    capacity_dive:    String(v.capacity_dive),
    capacity_snorkel: String(v.capacity_snorkel),
    need_captain:     v.need_captain ?? false,
  };
}

// ── Inline form row ───────────────────────────────────────────────────────────
function VesselFormRow({
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

  const set = (key: keyof FormState, val: string | boolean) =>
    onChange({ ...form, [key]: val });

  return (
    <div className={`flex items-center gap-3 px-6 py-3 flex-wrap ${isNew ? 'bg-teal-50' : 'bg-slate-50'}`}>
      {/* Name */}
      <input
        ref={nameRef}
        value={form.name}
        onChange={e => set('name', e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Boat name"
        className="flex-1 min-w-[140px] text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
      />

      {/* Abbreviation */}
      <input
        value={form.abbreviation}
        onChange={e => set('abbreviation', e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Abbrev."
        maxLength={6}
        className="w-20 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
      />

      {/* Dive capacity */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-slate-400 whitespace-nowrap">Dive cap.</label>
        <input
          type="number"
          min={1}
          value={form.capacity_dive}
          onChange={e => set('capacity_dive', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          placeholder="0"
          className="w-16 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
        />
      </div>

      {/* Snorkel capacity */}
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-slate-400 whitespace-nowrap">Snorkel cap.</label>
        <input
          type="number"
          min={1}
          value={form.capacity_snorkel}
          onChange={e => set('capacity_snorkel', e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          placeholder="0"
          className="w-16 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
        />
      </div>

      {/* Need captain */}
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.need_captain}
          onChange={e => set('need_captain', e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 text-teal-500 focus:ring-teal-400"
        />
        <span className="text-xs text-slate-500 whitespace-nowrap">Needs captain</span>
      </label>

      {/* Actions */}
      <div className="flex items-center gap-1.5 ml-auto shrink-0">
        <button
          onClick={onSave}
          disabled={isSaving || !form.name.trim() || !form.capacity_dive || !form.capacity_snorkel}
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
  );
}

// ── Read-only row ─────────────────────────────────────────────────────────────
function VesselRow({
  vessel,
  onEdit,
  onDelete,
  isDeleting,
}: {
  vessel: Vessel;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div className="group flex items-center gap-4 px-6 py-3 hover:bg-slate-50 transition-colors">
      {/* Name + abbreviation */}
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="font-medium text-slate-800 truncate">{vessel.name}</span>
        {vessel.abbreviation && (
          <span className="text-xs text-slate-400 shrink-0">({vessel.abbreviation})</span>
        )}
      </div>

      {/* Capacities */}
      <span className="text-sm text-slate-500 shrink-0">
        <span title="Dive capacity">🤿 <span className="font-semibold text-slate-700">{vessel.capacity_dive}</span></span>
        <span className="text-slate-300 mx-1.5">/</span>
        <span title="Snorkel capacity">🐠 <span className="font-semibold text-slate-700">{vessel.capacity_snorkel}</span></span>
      </span>

      {/* Captain badge */}
      {vessel.need_captain ? (
        <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
          Captain req.
        </span>
      ) : (
        <span className="shrink-0 w-[88px]" />
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit} title="Edit"
          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </button>
        <button onClick={onDelete} disabled={isDeleting} title="Delete"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40">
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

// ── Main component ────────────────────────────────────────────────────────────
export default function VesselsConfig({ orgId }: { orgId: string }) {
  const supabase = createClient();

  const [vessels,    setVessels]    = useState<Vessel[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState<FormState>(emptyForm());
  const [addForm,    setAddForm]    = useState<FormState | null>(null);
  const [isSaving,   setIsSaving]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('vessels')
      .select('id, name, abbreviation, capacity_dive, capacity_snorkel, need_captain')
      .eq('organization_id', orgId)
      .order('name')
      .then(({ data, error }) => {
        if (data) setVessels(data);
        if (error) setError(error.message);
        setIsLoading(false);
      });
  }, [orgId]);

  const startEdit = (vessel: Vessel) => {
    setAddForm(null);
    setEditingId(vessel.id);
    setEditForm(vesselToForm(vessel));
    setError(null);
  };

  const cancelEdit = () => { setEditingId(null); setError(null); };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setIsSaving(true);
    setError(null);
    const patch = {
      name:             editForm.name.trim(),
      abbreviation:     editForm.abbreviation.trim() || null,
      capacity_dive:    parseInt(editForm.capacity_dive, 10),
      capacity_snorkel: parseInt(editForm.capacity_snorkel, 10),
      need_captain:     editForm.need_captain,
    };
    const { error } = await supabase.from('vessels').update(patch).eq('id', editingId);
    if (error) { setError(error.message); setIsSaving(false); return; }
    setVessels(prev => prev.map(v => v.id === editingId ? { ...v, ...patch } : v));
    setEditingId(null);
    setIsSaving(false);
  };

  const handleAdd = async () => {
    if (!addForm) return;
    setIsSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from('vessels')
      .insert({
        organization_id:  orgId,
        name:             addForm.name.trim(),
        abbreviation:     addForm.abbreviation.trim() || null,
        capacity_dive:    parseInt(addForm.capacity_dive, 10),
        capacity_snorkel: parseInt(addForm.capacity_snorkel, 10),
        need_captain:     addForm.need_captain,
      })
      .select('id, name, abbreviation, capacity_dive, capacity_snorkel, need_captain')
      .single();
    if (error) { setError(error.message); setIsSaving(false); return; }
    if (data) setVessels(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setAddForm(null);
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    const { error } = await supabase.from('vessels').delete().eq('id', id);
    if (error) { setError(error.message); setDeletingId(null); return; }
    setVessels(prev => prev.filter(v => v.id !== id));
    setDeletingId(null);
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Boats</h2>
          <p className="text-xs text-slate-400 mt-0.5">Vessels available for trips</p>
        </div>
        {!addForm && (
          <button
            onClick={() => { setEditingId(null); setAddForm(emptyForm()); setError(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add boat
          </button>
        )}
      </div>

      {error && (
        <div className="px-6 py-2 bg-rose-50 border-b border-rose-100 text-xs text-rose-600">{error}</div>
      )}

      {isLoading ? (
        <div className="divide-y divide-slate-100">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 px-6 py-3">
              <div className="flex-1 h-4 bg-slate-100 animate-pulse rounded" />
              <div className="w-20 h-4 bg-slate-100 animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {addForm && (
            <VesselFormRow
              form={addForm}
              onChange={setAddForm}
              onSave={handleAdd}
              onCancel={() => { setAddForm(null); setError(null); }}
              isSaving={isSaving}
              isNew
            />
          )}
          {vessels.length === 0 && !addForm && (
            <div className="px-6 py-8 text-center text-sm text-slate-400">
              No boats yet — add your first one above.
            </div>
          )}
          {vessels.map(v =>
            editingId === v.id ? (
              <VesselFormRow
                key={v.id}
                form={editForm}
                onChange={setEditForm}
                onSave={handleSaveEdit}
                onCancel={cancelEdit}
                isSaving={isSaving}
                isNew={false}
              />
            ) : (
              <VesselRow
                key={v.id}
                vessel={v}
                onEdit={() => startEdit(v)}
                onDelete={() => handleDelete(v.id)}
                isDeleting={deletingId === v.id}
              />
            )
          )}
        </div>
      )}
    </section>
  );
}
