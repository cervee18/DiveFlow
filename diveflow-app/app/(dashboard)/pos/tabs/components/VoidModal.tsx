'use client';

import { fmtMoney } from './helpers';

interface VoidModalProps {
  target: { id: string; amount: number; method: string };
  reason: string;
  error: string;
  isPending: boolean;
  onReasonChange: (r: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function VoidModal({ target, reason, error, isPending, onReasonChange, onConfirm, onClose }: VoidModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-rose-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Void Payment</h2>
            <p className="text-xs text-slate-500 mt-0.5">{target.method} · {fmtMoney(target.amount)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-rose-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-sm text-rose-700">
            This will mark the payment as voided. The amount will be added back to the client's balance. This cannot be undone.
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Reason <span className="text-slate-400 normal-case font-normal">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Client cancellation, duplicate payment..."
              value={reason}
              onChange={e => onReasonChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onConfirm()}
              autoFocus
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-sm disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Voiding…' : 'Void Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
