'use client';

import { fmtMoney } from './helpers';
import { PAYMENT_METHODS } from './types';

interface DepositModalProps {
  clientName: string;
  method: string;
  amount: string;
  note: string;
  error: string;
  isPending: boolean;
  onMethodChange: (m: string) => void;
  onAmountChange: (a: string) => void;
  onNoteChange: (n: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function DepositModal({
  clientName,
  method,
  amount,
  note,
  error,
  isPending,
  onMethodChange,
  onAmountChange,
  onNoteChange,
  onConfirm,
  onClose,
}: DepositModalProps) {
  const parsedAmount = parseFloat(amount);
  const isValid = !isNaN(parsedAmount) && parsedAmount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-teal-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Record Deposit</h2>
            <p className="text-xs text-slate-500 mt-0.5">{clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-teal-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Info banner */}
          <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-xs text-teal-700">
            This deposit will be added as credit on the client's account and can be applied against future or existing charges.
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Received by
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onMethodChange(m)}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                    method === m
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Amount
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-4 flex items-center text-slate-400 font-bold text-lg">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => onAmountChange(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-4 py-3 text-2xl font-black font-mono text-slate-800 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                autoFocus
              />
            </div>
            {isValid && (
              <p className="text-xs text-teal-600 font-semibold mt-1">
                {fmtMoney(parsedAmount)} will be added as credit
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Note <span className="text-slate-400 normal-case font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={e => onNoteChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && isValid && onConfirm()}
              placeholder="e.g. Deposit for June trip"
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending || !isValid}
            className="flex-1 px-4 py-3 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl shadow-sm disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Saving…' : 'Record Deposit'}
          </button>
        </div>
      </div>
    </div>
  );
}
