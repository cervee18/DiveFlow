'use client';

import type { ClientVisit } from './types';

interface VisitSelectorModalProps {
  clientName: string;
  visits: ClientVisit[];
  selectedVisitId: string | null; // null = "no visit / client only"
  cartTotal: number;
  isPending: boolean;
  onSelectVisit: (visitId: string | null) => void;
  onConfirm: () => void;
  onClose: () => void;
}

function isCurrent(visit: ClientVisit): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return visit.startDate <= today && today <= visit.endDate;
}

export default function VisitSelectorModal({
  clientName,
  visits,
  selectedVisitId,
  cartTotal,
  isPending,
  onSelectVisit,
  onConfirm,
  onClose,
}: VisitSelectorModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Add to Tab</h2>
            <p className="text-xs text-slate-500 mt-0.5">{clientName} · ${cartTotal.toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select visit to charge</p>

          {visits.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500">
              No visits found — items will be added to the client's general tab.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {visits.map(v => {
                const current = isCurrent(v);
                const selected = selectedVisitId === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => onSelectVisit(v.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                      selected
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white border-slate-200 hover:border-teal-300 hover:bg-teal-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold ${selected ? 'text-white' : 'text-slate-800'}`}>{v.label}</span>
                      {current && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          selected ? 'bg-teal-500 text-white' : 'bg-emerald-100 text-emerald-700'
                        }`}>Current</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {visits.length > 0 && (
            <button
              onClick={() => onSelectVisit(null)}
              className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                selectedVisitId === null
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
              }`}
            >
              <span className="font-semibold">No specific visit</span>
              <p className={`text-xs mt-0.5 ${selectedVisitId === null ? 'text-slate-300' : 'text-slate-400'}`}>Add to client's general tab</p>
            </button>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-sm disabled:opacity-50 transition-colors"
          >{isPending ? 'Adding…' : 'Add to Tab'}</button>
        </div>
      </div>
    </div>
  );
}
