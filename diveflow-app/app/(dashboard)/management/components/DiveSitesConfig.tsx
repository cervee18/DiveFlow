'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useOrgSettings, formatDepth, depthUnit, inputToMetres, mToFt } from '@/app/(dashboard)/components/OrgSettingsContext';

interface DiveSiteGroup {
  id: string;
  name: string;
}

interface DiveSite {
  id: string;
  name: string;
  max_depth: number;
  latitude: number | null;
  longitude: number | null;
  group_id: string | null;
}

interface FormState {
  name: string;
  max_depth: string;
  latitude: string;
  longitude: string;
  group_id: string;
}

const emptyForm = (): FormState => ({ name: '', max_depth: '', latitude: '', longitude: '', group_id: '' });

function siteToForm(s: DiveSite, unitSystem: 'metric' | 'imperial'): FormState {
  const depthDisplay = unitSystem === 'imperial' ? mToFt(s.max_depth) : s.max_depth;
  return {
    name:      s.name,
    max_depth: String(depthDisplay),
    latitude:  s.latitude  != null ? String(s.latitude)  : '',
    longitude: s.longitude != null ? String(s.longitude) : '',
    group_id:  s.group_id ?? '',
  };
}

// ── Depth display ─────────────────────────────────────────────────────────────
function DepthDisplay({ metres }: { metres: number }) {
  const { unitSystem } = useOrgSettings();
  return (
    <span className="shrink-0 text-sm font-semibold text-slate-700">
      {formatDepth(metres, unitSystem)}
    </span>
  );
}

// ── Inline form row ───────────────────────────────────────────────────────────
function DiveSiteFormRow({
  form, onChange, onSave, onCancel, isSaving, isNew, groups,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isNew: boolean;
  groups: DiveSiteGroup[];
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  const { unitSystem } = useOrgSettings();

  const set = (key: keyof FormState, val: string) => onChange({ ...form, [key]: val });
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onSave();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className={`px-6 py-3 space-y-2 ${isNew ? 'bg-teal-50' : 'bg-slate-50'}`}>
      <div className="flex items-center gap-3">
        {/* Name */}
        <input
          ref={nameRef}
          value={form.name}
          onChange={e => set('name', e.target.value)}
          onKeyDown={onKey}
          placeholder="Site name"
          className="flex-1 min-w-0 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
        />

        {/* Group */}
        {groups.length > 0 && (
          <select
            value={form.group_id}
            onChange={e => set('group_id', e.target.value)}
            className="text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white text-slate-700"
          >
            <option value="">No group</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}

        {/* Max depth */}
        <div className="flex items-center gap-1.5 shrink-0">
          <label className="text-xs text-slate-400 whitespace-nowrap">Max depth</label>
          <input
            type="number"
            min={0}
            step={unitSystem === 'imperial' ? 1 : 0.5}
            value={form.max_depth}
            onChange={e => set('max_depth', e.target.value)}
            onKeyDown={onKey}
            placeholder="0"
            className="w-20 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
          />
          <span className="text-xs text-slate-400">{depthUnit(unitSystem)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Latitude */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-400 w-16 shrink-0">Latitude</label>
          <input
            type="number"
            step="any"
            value={form.latitude}
            onChange={e => set('latitude', e.target.value)}
            onKeyDown={onKey}
            placeholder="optional"
            className="w-36 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
          />
        </div>

        {/* Longitude */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-400 w-16 shrink-0">Longitude</label>
          <input
            type="number"
            step="any"
            value={form.longitude}
            onChange={e => set('longitude', e.target.value)}
            onKeyDown={onKey}
            placeholder="optional"
            className="w-36 text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <button
            onClick={onSave}
            disabled={isSaving || !form.name.trim() || !form.max_depth}
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
function DiveSiteRow({
  site, onEdit, onDelete, isDeleting, groups,
}: {
  site: DiveSite;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  groups: DiveSiteGroup[];
}) {
  const hasCoords = site.latitude != null && site.longitude != null;
  const group = groups.find(g => g.id === site.group_id);

  return (
    <div className="group flex items-center gap-4 px-6 py-3 hover:bg-slate-50 transition-colors">
      {/* Name */}
      <span className="flex-1 min-w-0 font-medium text-slate-800 truncate">{site.name}</span>

      {/* Group badge */}
      {group ? (
        <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
          {group.name}
        </span>
      ) : (
        <span className="shrink-0 w-[52px]" />
      )}

      {/* Max depth */}
      <DepthDisplay metres={site.max_depth} />

      {/* Coordinates badge */}
      {hasCoords ? (
        <a
          href={`https://maps.google.com/?q=${site.latitude},${site.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title={`${site.latitude}, ${site.longitude}`}
          className="shrink-0 flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 hover:bg-sky-100 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          Map
        </a>
      ) : (
        <span className="shrink-0 w-[52px]" />
      )}

      {/* Action buttons */}
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

// ── Groups card ───────────────────────────────────────────────────────────────
function GroupsCard({
  orgId, groups, setGroups,
}: {
  orgId: string;
  groups: DiveSiteGroup[];
  setGroups: React.Dispatch<React.SetStateAction<DiveSiteGroup[]>>;
}) {
  const supabase = createClient();
  const [adding,    setAdding]    = useState(false);
  const [newName,   setNewName]   = useState('');
  const [isSaving,  setIsSaving]  = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setIsSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from('divesite_groups')
      .insert({ organization_id: orgId, name })
      .select('id, name')
      .single();
    if (error) { setError(error.message); setIsSaving(false); return; }
    if (data) setGroups(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName('');
    setAdding(false);
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    const { error } = await supabase.from('divesite_groups').delete().eq('id', id);
    if (error) { setError(error.message); setDeletingId(null); return; }
    setGroups(prev => prev.filter(g => g.id !== id));
    setDeletingId(null);
  };

  if (groups.length === 0 && !adding) return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Site Groups</h2>
          <p className="text-xs text-slate-400 mt-0.5">Optional groupings for your dive sites</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add group
        </button>
      </div>
    </section>
  );

  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Site Groups</h2>
          <p className="text-xs text-slate-400 mt-0.5">Optional groupings for your dive sites</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add group
          </button>
        )}
      </div>

      {error && (
        <div className="px-6 py-2 bg-rose-50 border-b border-rose-100 text-xs text-rose-600">{error}</div>
      )}

      <div className="px-6 py-3 flex flex-wrap items-center gap-2">
        {groups.map(g => (
          <span
            key={g.id}
            className="group/chip flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full bg-violet-50 text-violet-700"
          >
            {g.name}
            <button
              onClick={() => handleDelete(g.id)}
              disabled={deletingId === g.id}
              className="text-violet-400 hover:text-rose-500 transition-colors disabled:opacity-40"
              title="Delete group"
            >
              {deletingId === g.id ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          </span>
        ))}

        {adding && (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setAdding(false); setNewName(''); }
              }}
              placeholder="Group name"
              className="text-sm px-2.5 py-1 border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white w-36"
            />
            <button
              onClick={handleAdd}
              disabled={isSaving || !newName.trim()}
              className="px-3 py-1 text-xs font-semibold bg-teal-500 text-white rounded-full hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Adding…' : 'Add'}
            </button>
            <button
              onClick={() => { setAdding(false); setNewName(''); setError(null); }}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DiveSitesConfig({ orgId }: { orgId: string }) {
  const supabase = createClient();
  const { unitSystem } = useOrgSettings();

  const [groups,     setGroups]     = useState<DiveSiteGroup[]>([]);
  const [sites,      setSites]      = useState<DiveSite[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editForm,   setEditForm]   = useState<FormState>(emptyForm());
  const [addForm,    setAddForm]    = useState<FormState | null>(null);
  const [isSaving,   setIsSaving]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase
        .from('divesite_groups')
        .select('id, name')
        .eq('organization_id', orgId)
        .order('name'),
      supabase
        .from('divesites')
        .select('id, name, max_depth, latitude, longitude, group_id')
        .eq('organization_id', orgId)
        .order('name'),
    ]).then(([{ data: gData, error: gErr }, { data: sData, error: sErr }]) => {
      if (gData) setGroups(gData);
      if (sData) setSites(sData);
      if (gErr || sErr) setError((gErr ?? sErr)!.message);
      setIsLoading(false);
    });
  }, [orgId]);

  const startEdit = (site: DiveSite) => {
    setAddForm(null);
    setEditingId(site.id);
    setEditForm(siteToForm(site, unitSystem));
    setError(null);
  };

  const cancelEdit = () => { setEditingId(null); setError(null); };

  const parseCoord = (val: string) => val.trim() === '' ? null : parseFloat(val);

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setIsSaving(true);
    setError(null);
    const patch = {
      name:      editForm.name.trim(),
      max_depth: inputToMetres(parseFloat(editForm.max_depth), unitSystem),
      latitude:  parseCoord(editForm.latitude),
      longitude: parseCoord(editForm.longitude),
      group_id:  editForm.group_id || null,
    };
    const { error } = await supabase.from('divesites').update(patch).eq('id', editingId);
    if (error) { setError(error.message); setIsSaving(false); return; }
    setSites(prev => prev.map(s => s.id === editingId ? { ...s, ...patch } : s));
    setEditingId(null);
    setIsSaving(false);
  };

  const handleAdd = async () => {
    if (!addForm) return;
    setIsSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from('divesites')
      .insert({
        organization_id: orgId,
        name:            addForm.name.trim(),
        max_depth:       inputToMetres(parseFloat(addForm.max_depth), unitSystem),
        latitude:        parseCoord(addForm.latitude),
        longitude:       parseCoord(addForm.longitude),
        group_id:        addForm.group_id || null,
      })
      .select('id, name, max_depth, latitude, longitude, group_id')
      .single();
    if (error) { setError(error.message); setIsSaving(false); return; }
    if (data) setSites(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setAddForm(null);
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    const { error } = await supabase.from('divesites').delete().eq('id', id);
    if (error) { setError(error.message); setDeletingId(null); return; }
    setSites(prev => prev.filter(s => s.id !== id));
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Groups card */}
      <GroupsCard orgId={orgId} groups={groups} setGroups={setGroups} />

      {/* Sites card */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Dive Sites</h2>
            <p className="text-xs text-slate-400 mt-0.5">Sites used in trip logs and dive records</p>
          </div>
          {!addForm && (
            <button
              onClick={() => { setEditingId(null); setAddForm(emptyForm()); setError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add site
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
                <div className="w-12 h-4 bg-slate-100 animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sites.length === 0 && !addForm && (
              <div className="px-6 py-8 text-center text-sm text-slate-400">
                No dive sites yet — add your first one above.
              </div>
            )}

            {sites.map(site =>
              editingId === site.id ? (
                <DiveSiteFormRow
                  key={site.id}
                  form={editForm}
                  onChange={setEditForm}
                  onSave={handleSaveEdit}
                  onCancel={cancelEdit}
                  isSaving={isSaving}
                  isNew={false}
                  groups={groups}
                />
              ) : (
                <DiveSiteRow
                  key={site.id}
                  site={site}
                  onEdit={() => startEdit(site)}
                  onDelete={() => handleDelete(site.id)}
                  isDeleting={deletingId === site.id}
                  groups={groups}
                />
              )
            )}

            {addForm && (
              <DiveSiteFormRow
                form={addForm}
                onChange={setAddForm}
                onSave={handleAdd}
                onCancel={() => { setAddForm(null); setError(null); }}
                isSaving={isSaving}
                isNew
                groups={groups}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
