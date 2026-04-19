'use client';

import { useState, useTransition } from 'react';
import { openPOS, closePOS } from './actions';
import { useRouter } from 'next/navigation';

interface Props {
  openSession: { id: string; opened_at: string; opened_by_email: string | null; opening_cash: number } | null;
  lastClosed: { closed_at: string; closed_by_email: string | null; opening_cash: number; opened_at: string } | null;
  summary: { method: string; total: number }[];
  transactionCount: number;
}

function fmtMoney(n: number) {
  return '$' + n.toFixed(2);
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function fmtEmail(email: string | null) {
  if (!email) return 'Unknown';
  return email.includes('@') ? email.split('@')[0] : email;
}

const METHOD_COLORS: Record<string, string> = {
  Cash:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  Visa:       'bg-blue-50 text-blue-700 border-blue-200',
  Mastercard: 'bg-orange-50 text-orange-700 border-orange-200',
  Amex:       'bg-indigo-50 text-indigo-700 border-indigo-200',
  Discover:   'bg-amber-50 text-amber-700 border-amber-200',
  Credit:     'bg-teal-50 text-teal-700 border-teal-200',
};

function methodBadge(method: string) {
  return METHOD_COLORS[method] ?? 'bg-slate-50 text-slate-700 border-slate-200';
}

export default function OpenCloseClient({ openSession, lastClosed, summary, transactionCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openingCash, setOpeningCash] = useState('');
  const [error, setError] = useState('');

  const grandTotal = summary.reduce((s, r) => s + r.total, 0);

  const handleOpen = () => {
    const cash = parseFloat(openingCash);
    if (isNaN(cash) || cash < 0) { setError('Enter a valid opening cash amount.'); return; }
    setError('');
    startTransition(async () => {
      const res = await openPOS(cash);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  };

  const handleClose = () => {
    setError('');
    startTransition(async () => {
      const res = await closePOS();
      if (res?.error) { setError(res.error); return; }
      router.refresh();
    });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">

      {/* Status card */}
      <div className={`rounded-xl border p-5 flex items-center gap-4 ${
        openSession
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-rose-50 border-rose-200'
      }`}>
        <div className={`w-4 h-4 rounded-full shrink-0 ${openSession ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        <div>
          <p className={`text-base font-bold ${openSession ? 'text-emerald-800' : 'text-rose-800'}`}>
            {openSession ? 'POS is Open' : 'POS is Closed'}
          </p>
          {openSession && (
            <p className="text-sm text-emerald-700 mt-0.5">
              Opened {fmtDateTime(openSession.opened_at)} by {fmtEmail(openSession.opened_by_email)}
              {' · '}Opening cash: {fmtMoney(openSession.opening_cash)}
            </p>
          )}
          {!openSession && lastClosed && (
            <p className="text-sm text-rose-700 mt-0.5">
              Last closed {fmtDateTime(lastClosed.closed_at)} by {fmtEmail(lastClosed.closed_by_email)}
            </p>
          )}
        </div>
      </div>

      {/* OPEN state: session summary */}
      {openSession && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">Session Summary</p>
            <p className="text-xs text-slate-400">{transactionCount} payment{transactionCount !== 1 ? 's' : ''}</p>
          </div>

          {summary.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">No payments recorded yet this session.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {summary.map(row => (
                <div key={row.method} className="flex items-center justify-between px-5 py-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${methodBadge(row.method)}`}>
                    {row.method}
                  </span>
                  <span className="font-mono font-semibold text-slate-800">{fmtMoney(row.total)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50">
                <span className="text-sm font-bold text-slate-700">Total</span>
                <span className="font-mono font-black text-slate-800 text-base">{fmtMoney(grandTotal)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CLOSED state: opening cash input */}
      {!openSession && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700">Opening Cash</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value)}
              className="w-full pl-7 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>
          <p className="text-xs text-slate-400">Count the cash in the drawer before opening.</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{error}</p>
      )}

      {/* Action button */}
      {openSession ? (
        <button
          onClick={handleClose}
          disabled={isPending}
          className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-md transition-colors disabled:opacity-50 text-sm"
        >
          {isPending ? 'Closing…' : 'Close POS'}
        </button>
      ) : (
        <button
          onClick={handleOpen}
          disabled={isPending}
          className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-md transition-colors disabled:opacity-50 text-sm"
        >
          {isPending ? 'Opening…' : 'Open POS'}
        </button>
      )}
    </div>
  );
}
