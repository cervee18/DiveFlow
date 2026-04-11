'use client';

import { fmtMoney } from './helpers';
import { PAYMENT_METHODS } from './types';

interface PayModalProps {
  clientName: string;
  visitSelectedBalance: number;
  parkedTotal: number;
  grandTotal: number;
  payMethod: string;
  payAmount: string;
  payError: string;
  isPending: boolean;
  onMethodChange: (m: string) => void;
  onAmountChange: (a: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export default function PayModal({
  clientName,
  visitSelectedBalance,
  parkedTotal,
  grandTotal,
  payMethod,
  payAmount,
  payError,
  isPending,
  onMethodChange,
  onAmountChange,
  onConfirm,
  onClose,
}: PayModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Pay</h2>
            <p className="text-xs text-slate-500 mt-0.5">{clientName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Breakdown */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
            {visitSelectedBalance > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Visit charges</span>
                <span className="font-mono font-semibold text-slate-700">{fmtMoney(visitSelectedBalance)}</span>
              </div>
            )}
            {parkedTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Parked sales</span>
                <span className="font-mono font-semibold text-slate-700">{fmtMoney(parkedTotal)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-sm font-semibold text-slate-600">Total due</span>
              <span className="text-2xl font-black font-mono text-slate-800">{fmtMoney(grandTotal)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m}
                  onClick={() => onMethodChange(m)}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                    payMethod === m ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >{m}</button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Amount</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-4 flex items-center text-slate-400 font-bold text-lg">$</span>
              <input
                type="number" min="0" step="0.01"
                value={payAmount}
                onChange={e => onAmountChange(e.target.value)}
                className="w-full pl-9 pr-4 py-3 text-2xl font-black font-mono text-slate-800 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                autoFocus
              />
            </div>
            <button onClick={() => onAmountChange(grandTotal.toFixed(2))} className="mt-2 text-xs font-semibold text-teal-600 hover:underline">
              Use total due ({fmtMoney(grandTotal)})
            </button>
            {payError && <p className="text-xs text-red-500 mt-1">{payError}</p>}
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending || !payAmount || parseFloat(payAmount) <= 0}
            className="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-sm disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Processing…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
