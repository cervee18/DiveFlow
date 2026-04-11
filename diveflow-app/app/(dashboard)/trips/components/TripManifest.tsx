'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import AddDiverModal from './AddDiverModal';
import MoveClientModal from './MoveClientModal';
import {
  useTripManifest,
  TripInfo,
  TankOption,
  TANK_LABELS,
  GROUP_COLORS,
  formatLastDive,
  nextTank,
} from './hooks/useTripManifest';
import { printTripManifest } from '../utils/printTripManifest';

// ─── TankChip ─────────────────────────────────────────────────────────────────

function TankChip({ value, onChange }: { value: string | null | undefined; onChange: (v: TankOption) => void }) {
  const effective = (value as TankOption) ?? 'air';
  const isEanx = effective.endsWith('eanx');
  return (
    <button
      onClick={() => onChange(nextTank(value))}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer border ${
        isEanx
          ? 'bg-emerald-100 border-emerald-300 text-emerald-700 hover:bg-emerald-200'
          : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200'
      }`}
    >
      {TANK_LABELS[effective]}
    </button>
  );
}

// ─── renderNextChip ───────────────────────────────────────────────────────────

function renderNextChip(label: string) {
  const [status, nextAbbr] = label.split('|');
  const nextChip = nextAbbr
    ? nextAbbr === 'LD'
      ? <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200">LD</span>
      : <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">{nextAbbr}</span>
    : null;
  if (status === '#ARR') return (
    <span className="inline-flex items-center gap-0.5">
      <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-black bg-violet-100 text-violet-700 border border-violet-200">#ARR</span>
      {nextChip}
    </span>
  );
  if (status === 'ARR') return (
    <span className="inline-flex items-center gap-0.5">
      <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-black bg-sky-100 text-sky-700 border border-sky-200">ARR</span>
      {nextChip}
    </span>
  );
  if (label === 'LD')  return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200">LD</span>;
  if (label === '-')   return <span className="text-[10px] text-slate-300">-</span>;
  return <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">{label}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TripManifest({
  tripId,
  tripDate,
  capacity,
  numberOfDives = 1,
  tripCategory,
  onManifestChange,
  onMovedToTrip,
  tripInfo,
}: {
  tripId: string;
  tripDate: string;
  capacity?: number;
  numberOfDives?: number;
  tripCategory?: string;
  onManifestChange?: () => void;
  onMovedToTrip?: (trip: any) => void;
  tripInfo?: TripInfo;
}) {
  const {
    manifest,
    isLoading,
    isAddModalOpen,
    setIsAddModalOpen,
    selectedIds,
    toggleSelection,
    toggleSelectAll,
    selectGroup,
    clearSelection,
    pendingChanges,
    pendingClientChanges,
    isSaving,
    nextTripMap,
    clientVisitIdMap,
    certLevels,
    activities,
    displayManifest,
    tankSummary,
    pingDelay,
    fetchData,
    handleChange,
    handleClientChange,
    handleSave,
    handleDiscard,
    handleBulkDelete,
    handleMoveSuccess,
    getSizesFor,
  } = useTripManifest({ tripId, tripDate, numberOfDives, tripCategory, onManifestChange, onMovedToTrip });

  const [moveMode, setMoveMode] = useState<'move' | 'add'>('move');
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);

  const openMoveModal = (mode: 'move' | 'add') => {
    setMoveMode(mode);
    setIsMoveModalOpen(true);
  };

  // Keyboard shortcuts: Enter → save, Escape → discard (and block drawer close)
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const handleDiscardRef = useRef(handleDiscard);
  handleDiscardRef.current = handleDiscard;
  const hasPendingRef = useRef(false);
  hasPendingRef.current = Object.keys(pendingChanges).length > 0 || Object.keys(pendingClientChanges).length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const target = e.target as HTMLElement;
        const isTextInput = target.tagName === 'INPUT' &&
          ['text', 'number', 'date'].includes((target as HTMLInputElement).type);
        if (!isTextInput && hasPendingRef.current) {
          e.preventDefault();
          handleSaveRef.current();
        }
      }
      if (e.key === 'Escape' && hasPendingRef.current) {
        e.stopImmediatePropagation(); // prevent TripDrawer from closing
        handleDiscardRef.current();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  // Cert level grouping
  const NONPROF_ORDER = ['DSD', 'SD', 'OWD', 'AOWD', 'Resc'];
  const nonprofSet = new Set(NONPROF_ORDER);
  const nonprofCertLevels = NONPROF_ORDER.map(abbr => certLevels.find((cl: any) => cl.abbreviation === abbr)).filter(Boolean);
  const profCertLevels = certLevels.filter((cl: any) => !nonprofSet.has(cl.abbreviation));

  // Group bracket metadata
  const visitCounts: Record<string, number> = {};
  displayManifest.forEach(d => {
    const vid = clientVisitIdMap[d.client_id];
    if (vid) visitCounts[vid] = (visitCounts[vid] || 0) + 1;
  });
  const groupVisitIds = [...new Set(displayManifest.map(d => clientVisitIdMap[d.client_id]).filter(Boolean))].filter(vid => visitCounts[vid] >= 2);
  const visitColorIndex: Record<string, number> = {};
  groupVisitIds.forEach((vid, i) => { visitColorIndex[vid] = i; });

  const allIds = displayManifest.map(d => d.id);
  const allSelected = allIds.length > 0 && selectedIds.size === allIds.length;
  const someSelected = selectedIds.size > 0;
  const selectedDivers = displayManifest.filter(d => selectedIds.has(d.id));

  const totalCols = 18 + Math.min(numberOfDives, 2) - (numberOfDives === 0 ? 3 : 0);

  return (
    <div className="flex-1 flex flex-col mt-4 relative">
      {/* Toolbar */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Diver Manifest</h3>
          <p className="text-[10px] text-slate-500 uppercase">Click row to select • Click bracket to select group</p>
          {tankSummary.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Tanks:</span>
              {tankSummary.map(({ label, count, isEanx }) => (
                <span
                  key={label}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                    isEanx
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <span className="font-black">{count}×</span> {label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk actions — visible when divers are selected */}
          {someSelected && (
            <div className="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
              <span className="text-[11px] font-bold text-slate-500">{selectedIds.size} selected</span>
              <button
                onClick={() => openMoveModal('add')}
                title="Add selected to another trip"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Add to
              </button>
              <button
                onClick={() => openMoveModal('move')}
                title="Move selected to another trip"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Move
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isSaving}
                title="Remove selected from trip"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
              <button
                onClick={clearSelection}
                title="Clear selection"
                className="text-slate-400 hover:text-slate-600 transition-colors p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {(Object.keys(pendingChanges).length > 0 || Object.keys(pendingClientChanges).length > 0) && (
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
          {manifest.length > 0 && (
            <button
              onClick={() => printTripManifest({ displayManifest, pendingChanges, numberOfDives, tripInfo, tankSummary, nextTripMap })}
              className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span className="hidden lg:inline">Print</span>
            </button>
          )}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden lg:inline">Add Diver</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full h-full text-left border-collapse text-[11px] whitespace-nowrap min-w-max">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-tighter">
              {/* Bracket col */}
              <th className="p-0 sticky left-0 z-20 bg-slate-50" style={{ width: '15px' }} />
              {/* Select-all checkbox */}
              <th className="px-2 py-3 sticky left-[15px] bg-slate-50 z-20" style={{ width: '28px' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={() => toggleSelectAll(allIds)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                  title="Select all"
                />
              </th>
              <th className="px-3 py-3 border-r sticky left-[43px] bg-slate-50 z-20 shadow-[1px_0_0_0_#e2e8f0]" style={{ width: '130px', minWidth: '100px', maxWidth: '130px' }}>Diver Name</th>
              <th className="px-2 py-3 text-center" title="Waiver">
                <svg className="w-3.5 h-3.5 mx-auto text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </th>
              <th className="px-2 py-3 text-center" title="Deposit">
                <svg className="w-3.5 h-3.5 mx-auto text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
              </th>
              <th className="px-2 py-3 text-center border-r" title="Pick Up">
                <svg className="w-3.5 h-3.5 mx-auto text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1" /></svg>
              </th>
              <th className="px-3 py-3 text-center border-r">LD</th>
              <th className="px-3 py-3 text-center border-r" style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }}>Cert</th>
              {numberOfDives > 0 && <th className="px-2 py-3 text-center border-r bg-teal-50/30">BCD</th>}
              <th className="px-2 py-3 text-center border-r bg-teal-50/30">Suit</th>
              <th className="px-2 py-3 text-center border-r bg-teal-50/30">Fins</th>
              <th className="px-2 py-3 text-center border-r bg-teal-50/30">Mask</th>
              {numberOfDives > 0 && <th className="px-2 py-3 text-center border-r">Reg</th>}
              {numberOfDives > 0 && <th className="px-2 py-3 text-center border-r">Comp</th>}
              {numberOfDives >= 1 && <th className="px-2 py-3 text-center border-r">T1</th>}
              {numberOfDives >= 2 && <th className="px-2 py-3 text-center border-r">T2</th>}
              <th className="px-2 py-3 text-center border-r">Wei.</th>
              <th className="px-2 py-3 text-center border-r" title="Private Instructor">Priv</th>
              <th className="px-3 py-3 text-center border-r" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>Activity</th>
              <th className="px-3 py-3 text-center border-r">Next</th>
              <th className="px-3 py-3 w-48">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && manifest.length === 0 ? (
              <tr><td colSpan={totalCols + 1} className="py-10 text-center text-slate-400">Loading divers...</td></tr>
            ) : (
              displayManifest.map((diver) => {
                const rowChanges = pendingChanges[diver.id] || {};
                const isModified = !!pendingChanges[diver.id] || !!pendingClientChanges[diver.client_id];
                const isSelected = selectedIds.has(diver.id);
                const effectiveLd = pendingClientChanges[diver.client_id]?.last_dive_date ?? diver.clients?.last_dive_date ?? '';
                const isStale = effectiveLd
                  ? (Date.now() - new Date(effectiveLd).getTime()) > 365 * 24 * 60 * 60 * 1000
                  : false;

                const visitId = clientVisitIdMap[diver.client_id];
                const isInGroup = !!(visitId && visitCounts[visitId] >= 2);
                const groupMembers = isInGroup ? displayManifest.filter(d => clientVisitIdMap[d.client_id] === visitId) : [];
                const posInGroup = isInGroup ? groupMembers.findIndex(d => d.id === diver.id) : -1;
                const bracketIsFirst = posInGroup === 0;
                const bracketIsLast  = posInGroup === groupMembers.length - 1;
                const bracketColor   = isInGroup ? GROUP_COLORS[visitColorIndex[visitId] % GROUP_COLORS.length] : null;

                const rowBg = isSelected ? 'bg-teal-50/60' : isModified ? 'bg-amber-50/40' : 'hover:bg-slate-50/50';

                return (
                  <tr
                    key={diver.id}
                    className={`${rowBg} transition-colors cursor-pointer select-none`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('input, select, button, a')) return;
                      toggleSelection(diver.id);
                    }}
                  >
                    {/* Group bracket — click selects entire group */}
                    <td
                      className={`relative p-0 sticky left-0 z-10 ${isSelected ? 'bg-teal-50' : isModified ? 'bg-amber-50' : 'bg-white'} ${isInGroup ? 'cursor-pointer' : ''}`}
                      style={{ width: '15px' }}
                      onClick={isInGroup ? (e) => { e.stopPropagation(); selectGroup(visitId); } : undefined}
                      title={isInGroup ? 'Click to select entire group' : undefined}
                    >
                      {bracketColor && (
                        <div
                          className={`absolute left-1/2 -translate-x-1/2 w-[5px] ${bracketColor}`}
                          style={{
                            top: bracketIsFirst ? '50%' : '0',
                            bottom: bracketIsLast ? '50%' : '0',
                            borderRadius: bracketIsFirst ? '9999px 9999px 0 0' : bracketIsLast ? '0 0 9999px 9999px' : '0',
                          }}
                        />
                      )}
                    </td>

                    {/* Row checkbox */}
                    <td
                      className={`px-2 py-2 sticky left-[15px] z-10 ${isSelected ? 'bg-teal-50' : isModified ? 'bg-amber-50' : 'bg-white'}`}
                      style={{ width: '28px' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(diver.id)}
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                    </td>

                    {/* Name */}
                    <td className={`px-3 py-2 font-bold text-slate-900 border-r sticky left-[43px] z-10 shadow-[1px_0_0_0_#e2e8f0] ${isSelected ? 'bg-teal-50' : isModified ? 'bg-amber-50' : 'bg-white'}`} style={{ maxWidth: '130px' }}>
                      <Link
                        href={`/clients?clientId=${diver.client_id}`}
                        className="hover:text-teal-600 hover:underline transition-colors truncate block"
                        onClick={e => e.stopPropagation()}
                      >
                        {diver.clients?.first_name} {diver.clients?.last_name}
                      </Link>
                    </td>

                    {/* Admin toggles */}
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => handleChange(diver.id, 'waiver', !(rowChanges.waiver ?? diver.waiver ?? false))} title="Toggle Waiver" className="relative mx-auto block p-0.5">
                        {!(rowChanges.waiver ?? diver.waiver) && <span style={{ animationDelay: pingDelay }} className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />}
                        <svg className={`relative w-4 h-4 transition-colors ${(rowChanges.waiver ?? diver.waiver) ? 'text-emerald-500' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </button>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => handleChange(diver.id, 'deposit', !(rowChanges.deposit ?? diver.deposit ?? false))} title="Toggle Deposit" className="relative mx-auto block p-0.5">
                        {!(rowChanges.deposit ?? diver.deposit) && <span style={{ animationDelay: pingDelay }} className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />}
                        <svg className={`relative w-4 h-4 transition-colors ${(rowChanges.deposit ?? diver.deposit) ? 'text-emerald-500' : 'text-red-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                      </button>
                    </td>
                    <td className="px-2 py-2 border-r text-center">
                      <button onClick={() => handleChange(diver.id, 'pick_up', !(rowChanges.pick_up ?? diver.pick_up ?? false))} title="Toggle Pick Up" className="mx-auto block">
                        <svg className={`w-4 h-4 transition-colors ${(rowChanges.pick_up ?? diver.pick_up) ? 'text-emerald-500' : 'text-red-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0zM13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1" /></svg>
                      </button>
                    </td>

                    {/* Last Dive */}
                    <td className="px-3 py-2 border-r text-center font-medium">
                      <div className="relative inline-block">
                        <span className={`text-[11px] ${isStale ? 'text-amber-500' : effectiveLd ? 'text-slate-500' : 'text-amber-600'}`}>
                          {effectiveLd ? formatLastDive(effectiveLd) : 'New'}
                        </span>
                        <input
                          type="date"
                          value={effectiveLd}
                          onChange={e => handleClientChange(diver.client_id, 'last_dive_date', e.target.value || null)}
                          onKeyDown={e => e.key === 'Enter' && handleSave()}
                          title="Click to edit last dive date"
                          className="absolute inset-0 opacity-0 cursor-pointer w-full"
                        />
                      </div>
                    </td>

                    {/* Cert Level */}
                    <td className="px-1 py-1 border-r text-center" style={{ width: '70px', minWidth: '70px', maxWidth: '70px' }}>
                      <select
                        value={pendingClientChanges[diver.client_id]?.cert_level ?? diver.clients?.cert_level ?? ''}
                        onChange={e => handleClientChange(diver.client_id, 'cert_level', e.target.value || null)}
                        className="w-full bg-transparent border-none focus:ring-1 focus:ring-teal-500 rounded text-[10px] font-bold text-slate-700 cursor-pointer text-center"
                      >
                        <option value="">-</option>
                        <optgroup label="Recreational">
                          {nonprofCertLevels.map((cl: any) => (
                            <option key={cl.id} value={cl.id}>{cl.abbreviation}</option>
                          ))}
                        </optgroup>
                        {profCertLevels.length > 0 && (
                          <optgroup label="Professional">
                            {profCertLevels.map((cl: any) => (
                              <option key={cl.id} value={cl.id}>{cl.abbreviation}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </td>

                    {/* Equipment dropdowns */}
                    {(numberOfDives > 0 ? ['bcd', 'wetsuit', 'fins', 'mask'] : ['wetsuit', 'fins', 'mask']).map(gear => (
                      <td key={gear} className="px-1 py-1 border-r bg-teal-50/10 hover:bg-white transition-colors">
                        <select value={rowChanges[gear] ?? diver[gear] ?? ''} onChange={e => handleChange(diver.id, gear, e.target.value)} className="w-full bg-transparent border-none focus:ring-1 focus:ring-teal-500 rounded text-[10px] font-bold text-slate-700 cursor-pointer appearance-none text-center">
                          <option value="">-</option>
                          {getSizesFor(gear).map((s: string) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    ))}

                    {/* Boolean equipment */}
                    {numberOfDives > 0 && (
                      <td className="px-2 py-2 border-r text-center">
                        <input type="checkbox" checked={rowChanges.regulator ?? diver.regulator ?? false} onChange={e => handleChange(diver.id, 'regulator', e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer" />
                      </td>
                    )}
                    {numberOfDives > 0 && (
                      <td className="px-2 py-2 border-r text-center">
                        <input type="checkbox" checked={rowChanges.computer ?? diver.computer ?? false} onChange={e => handleChange(diver.id, 'computer', e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer" />
                      </td>
                    )}

                    {/* Tank chips */}
                    {numberOfDives >= 1 && (
                      <td className="px-2 py-1 border-r text-center">
                        <TankChip value={rowChanges.tank1 ?? diver.tank1} onChange={v => handleChange(diver.id, 'tank1', v)} />
                      </td>
                    )}
                    {numberOfDives >= 2 && (
                      <td className="px-2 py-1 border-r text-center">
                        <TankChip value={rowChanges.tank2 ?? diver.tank2} onChange={v => handleChange(diver.id, 'tank2', v)} />
                      </td>
                    )}

                    {/* Weights */}
                    <td className="px-2 py-1 border-r text-center">
                      <input type="text" value={rowChanges.weights ?? diver.weights ?? ''} onChange={e => handleChange(diver.id, 'weights', e.target.value === '' ? null : e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="-" className="w-12 text-[10px] font-bold text-slate-700 bg-transparent border-none focus:ring-1 focus:ring-teal-500 rounded p-0.5 text-center placeholder:text-slate-300" />
                    </td>

                    {/* Private instructor */}
                    <td className="px-2 py-2 border-r text-center">
                      <input type="checkbox" checked={rowChanges.private ?? diver.private ?? false} onChange={e => handleChange(diver.id, 'private', e.target.checked)} title="Private instructor" className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer" />
                    </td>

                    {/* Activity — when set, trip charge is waived automatically */}
                    <td className="px-1 py-1 border-r text-center" style={{ width: '110px', minWidth: '110px', maxWidth: '110px' }}>
                      {(() => {
                        const effectiveActivityId = rowChanges.activity_id !== undefined ? rowChanges.activity_id : (diver.activity_id ?? '');
                        return (
                          <div className="flex flex-col gap-0.5">
                            <select
                              value={effectiveActivityId}
                              onChange={e => handleChange(diver.id, 'activity_id', e.target.value || null)}
                              className={`w-full bg-transparent border-none focus:ring-1 focus:ring-violet-500 rounded text-[10px] font-bold cursor-pointer text-center ${effectiveActivityId ? 'text-violet-600' : 'text-slate-400'}`}
                            >
                              <option value="">—</option>
                              {activities.map((a: any) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Next trip */}
                    <td className="px-2 py-2 border-r text-center">
                      {nextTripMap[diver.client_id] ? renderNextChip(nextTripMap[diver.client_id]) : <span className="text-[10px] text-slate-300">—</span>}
                    </td>

                    {/* Notes */}
                    <td className="px-2 py-1">
                      <input type="text" value={rowChanges.notes ?? diver.notes ?? ''} onChange={e => handleChange(diver.id, 'notes', e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="Add note..." className="w-full min-w-[150px] bg-transparent border-none focus:ring-1 focus:ring-teal-500 px-2 py-1 text-slate-500 italic placeholder:text-slate-300 rounded" />
                    </td>
                  </tr>
                );
              })
            )}

            {/* Empty slots up to vessel capacity */}
            {capacity && !isLoading && (() => {
              const emptySlots = Math.max(0, capacity - manifest.length);
              return Array.from({ length: emptySlots }).map((_, i) => (
                <tr key={`empty-${i}`} className="hover:bg-slate-50/50 transition-colors group/empty">
                  <td className="p-0 sticky left-0 z-10 bg-white" style={{ width: '15px' }} />
                  <td className="px-2 py-2 sticky left-[15px] bg-white z-10" style={{ width: '28px' }} />
                  <td className="px-3 py-2 border-r sticky left-[43px] bg-white z-10 shadow-[1px_0_0_0_#e2e8f0]">
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="flex items-center gap-1.5 text-slate-300 hover:text-teal-600 transition-colors opacity-100 lg:opacity-0 lg:group-hover/empty:opacity-100 focus:opacity-100 text-[11px] font-semibold"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Diver
                    </button>
                  </td>
                  {Array.from({ length: 16 + Math.min(numberOfDives, 2) - (numberOfDives === 0 ? 3 : 0) }).map((_, j) => (
                    <td key={j} className="px-2 py-2"><span className="block h-[18px]" /></td>
                  ))}
                </tr>
              ));
            })()}

            {/* Filler row */}
            <tr className="h-full"><td colSpan={totalCols + 1} /></tr>
          </tbody>
        </table>
      </div>

      <AddDiverModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        tripId={tripId}
        tripDate={tripDate}
        onSuccess={() => {
          fetchData();
          setIsAddModalOpen(false);
          onManifestChange?.();
        }}
      />
      <MoveClientModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        divers={selectedDivers}
        mode={moveMode}
        currentTripId={tripId}
        currentTripDate={tripDate}
        onSuccess={(targetTrip, mode) => {
          setIsMoveModalOpen(false);
          handleMoveSuccess(targetTrip, mode);
        }}
      />
    </div>
  );
}
