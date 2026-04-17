'use client';

import { useState, useEffect } from 'react';
import { fmtMoney } from './helpers';
import { PAYMENT_METHODS } from './types';

export interface PaymentSplit {
  amount: number;
  method: string;
}

interface PayModalProps {
  clientName: string;
  visitSelectedBalance: number;
  standaloneSelectedBalance: number;
  grandTotal: number;
  creditBalance: number;
  isPending: boolean;
  onConfirm: (splits: PaymentSplit[]) => void;
  onClose: () => void;
}

export default function PayModal({
  clientName,
  visitSelectedBalance,
  standaloneSelectedBalance,
  grandTotal,
  creditBalance,
  isPending,
  onConfirm,
  onClose,
}: PayModalProps) {
  const [method, setMethod] = useState(PAYMENT_METHODS[0] as string);
  const [amount, setAmount] = useState(grandTotal.toFixed(2));
  // Split mode: credit + second method
  const [creditApply, setCreditApply] = useState('');
  const [secondMethod, setSecondMethod] = useState(PAYMENT_METHODS[0] as string);
  const [error, setError] = useState('');

  // When switching to Credit, pre-fill credit amount
  const handleMethodChange = (m: string) => {
    setMethod(m);
    setError('');
    if (m === 'Credit') {
      setCreditApply(Math.min(creditBalance, grandTotal).toFixed(2));
    }
  };

  // Keep amount in sync when grandTotal changes (e.g., different selection)
  useEffect(() => {
    if (method !== 'Credit') setAmount(grandTotal.toFixed(2));
  }, [grandTotal, method]);

  const isCreditFull = method === 'Credit' && creditBalance >= grandTotal;
  const isCreditSplit = method === 'Credit' && creditBalance < grandTotal;

  const creditNum   = parseFloat(creditApply) || 0;
  const remaining   = Math.round(Math.max(grandTotal - creditNum, 0) * 100) / 100;
  const amountNum   = parseFloat(amount) || 0;

  const handleConfirm = () => {
    setError('');

    if (isCreditFull) {
      // Full coverage by credit
      onConfirm([{ amount: grandTotal, method: 'Credit' }]);
      return;
    }

    if (isCreditSplit) {
      if (creditNum <= 0) { setError('Enter a valid credit amount.'); return; }
      if (creditNum > creditBalance) { setError(`Maximum credit available is ${fmtMoney(creditBalance)}.`); return; }
      if (remaining <= 0) { setError('Credit covers the full amount — switch to "Credit" only.'); return; }
      onConfirm([
        { amount: creditNum, method: 'Credit' },
        { amount: remaining, method: secondMethod },
      ]);
      return;
    }

    // Regular single method
    if (isNaN(amountNum) || amountNum <= 0) { setError('Enter a valid amount.'); return; }
    onConfirm([{ amount: amountNum, method }]);
  };

  const confirmLabel = isCreditSplit
    ? `Pay ${fmtMoney(grandTotal)} (split)`
    : `Pay ${fmtMoney(isCreditFull ? grandTotal : amountNum)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
        {/* Header */}
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
            {standaloneSelectedBalance > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Direct charges</span>
                <span className="font-mono font-semibold text-slate-700">{fmtMoney(standaloneSelectedBalance)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-sm font-semibold text-slate-600">Total due</span>
              <span className="text-2xl font-black font-mono text-slate-800">{fmtMoney(grandTotal)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Payment Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMethodChange(m)}
                  className={`px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                    method === m
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >{m}</button>
              ))}
              {creditBalance > 0 && (
                <button
                  type="button"
                  onClick={() => handleMethodChange('Credit')}
                  className={`col-span-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors flex items-center justify-between ${
                    method === 'Credit'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-teal-50 text-teal-700 border-teal-200 hover:border-teal-300'
                  }`}
                >
                  <span>Credit on Account</span>
                  <span className={`text-xs font-mono ${method === 'Credit' ? 'text-teal-100' : 'text-teal-500'}`}>
                    {fmtMoney(creditBalance)} available
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* ── Credit split UI ── */}
          {isCreditSplit && (
            <div className="space-y-4">
              {/* Credit portion */}
              <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-teal-700 uppercase tracking-wider">Credit applied</span>
                  <span className="text-xs text-teal-500 font-mono">{fmtMoney(creditBalance)} available</span>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-teal-400 font-bold">$</span>
                  <input
                    type="number"
                    min="0"
                    max={Math.min(creditBalance, grandTotal)}
                    step="0.01"
                    value={creditApply}
                    onChange={e => setCreditApply(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-lg font-black font-mono text-teal-800 rounded-lg border border-teal-200 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 bg-white"
                  />
                </div>
              </div>

              {/* Remaining row */}
              <div className="flex items-center gap-3 px-1">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-semibold shrink-0">
                  {fmtMoney(remaining)} remaining
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {/* Second payment method */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Remaining paid by
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSecondMethod(m)}
                      className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                        secondMethod === m
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >{m}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Regular amount input (non-split) ── */}
          {!isCreditFull && !isCreditSplit && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Amount</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-4 flex items-center text-slate-400 font-bold text-lg">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConfirm()}
                  className="w-full pl-9 pr-4 py-3 text-2xl font-black font-mono text-slate-800 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => setAmount(grandTotal.toFixed(2))}
                className="mt-2 text-xs font-semibold text-teal-600 hover:underline"
              >
                Use total due ({fmtMoney(grandTotal)})
              </button>
            </div>
          )}

          {/* Credit full coverage note */}
          {isCreditFull && (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-sm text-teal-700 font-semibold text-center">
              {fmtMoney(grandTotal)} will be covered by account credit
            </div>
          )}

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
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-sm disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
