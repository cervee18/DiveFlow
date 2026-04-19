'use client';

import { useState, useMemo, Fragment } from 'react';
import Link from 'next/link';

interface DisplayPayment {
  ids: string[];
  amount: number;
  methods: string[];
  createdAt: string;
  recordedByEmail: string | null;
  voided: boolean;
  voidReason: string | null;
}

interface InvoiceRow {
  id: string;
  createdAt: string;
  clientId: string | null;
  clientName: string | null;
  visitId: string | null;
  visitLabel: string | null;
  isVisitInvoice: boolean;
  manualSubtotal: number;
  totalPaid: number;
  status: 'open' | 'settled';
  payments: DisplayPayment[];
}

type Filter = 'all' | 'open' | 'settled';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });
}

const METHOD_COLORS: Record<string, string> = {
  Cash:       'bg-emerald-50 text-emerald-700 border-emerald-100',
  Visa:       'bg-blue-50 text-blue-700 border-blue-100',
  Mastercard: 'bg-orange-50 text-orange-700 border-orange-100',
  Amex:       'bg-indigo-50 text-indigo-700 border-indigo-100',
  Credit:     'bg-teal-50 text-teal-700 border-teal-100',
};
const DEFAULT_METHOD_COLOR = 'bg-slate-50 text-slate-600 border-slate-200';

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvoicesClient({ invoices }: { invoices: InvoiceRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'open')    return invoices.filter(i => i.status === 'open');
    if (filter === 'settled') return invoices.filter(i => i.status === 'settled');
    return invoices;
  }, [invoices, filter]);

  // Summary stats (always over all settled invoices regardless of filter)
  const settledInvoices = useMemo(() => invoices.filter(i => i.status === 'settled'), [invoices]);
  const openInvoices    = useMemo(() => invoices.filter(i => i.status === 'open'),    [invoices]);
  const totalCollected  = useMemo(() =>
    settledInvoices.reduce((s, i) => s + i.totalPaid, 0), [settledInvoices]);

  const methodTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of settledInvoices) {
      for (const p of inv.payments) {
        if (p.voided) continue;
        for (const m of p.methods) {
          map[m] = Math.round(((map[m] ?? 0) + p.amount / p.methods.length) * 100) / 100;
        }
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [settledInvoices]);

  const toggleExpand = (id: string) =>
    setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Filter tabs + summary strip */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Tabs */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 gap-1 self-start">
          {(['all', 'open', 'settled'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors capitalize ${
                filter === f
                  ? 'bg-teal-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {f}
              {f === 'open' && openInvoices.length > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filter === 'open' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                  {openInvoices.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-3 shadow-sm">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Collected</p>
              <p className="text-lg font-black font-mono text-emerald-600">{fmtMoney(totalCollected)}</p>
            </div>
            {methodTotals.length > 0 && (
              <div className="border-l border-slate-100 pl-3 flex items-center gap-2">
                {methodTotals.map(([method, total]) => (
                  <span key={method} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border ${METHOD_COLORS[method] ?? DEFAULT_METHOD_COLOR}`}>
                    {method} <span className="font-mono font-normal">{fmtMoney(total)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          {openInvoices.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 shadow-sm">
              <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wider">Open</p>
              <p className="text-lg font-black text-amber-700">{openInvoices.length} invoice{openInvoices.length !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2">
            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
            No invoices found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide sticky top-0">
                <th className="px-4 py-3 text-left w-36">Date</th>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Context</th>
                <th className="px-4 py-3 text-right w-28">Collected</th>
                <th className="px-4 py-3 text-center w-24">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const isExpanded = expandedId === inv.id;
                const isSettled = inv.status === 'settled';

                return (
                  <Fragment key={inv.id}>
                    <tr
                      onClick={() => isSettled ? toggleExpand(inv.id) : undefined}
                      className={`border-b border-slate-50 transition-colors ${isSettled ? 'cursor-pointer hover:bg-slate-50/70' : ''}`}
                    >
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {fmtDate(inv.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700 truncate max-w-[10rem]">
                        {inv.clientName ?? <span className="text-slate-400 font-normal">Walk-in</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {inv.visitLabel ? (
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">
                            {inv.visitLabel}
                          </span>
                        ) : inv.manualSubtotal > 0 ? (
                          <span className="text-slate-400">Direct charges</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {isSettled
                          ? <span className="text-emerald-600">{fmtMoney(inv.totalPaid)}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isSettled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                            Settled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                            Open
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isSettled ? (
                          <svg
                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 mx-auto ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        ) : inv.clientId ? (
                          <Link
                            href={`/pos/tabs?clientId=${inv.clientId}`}
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-teal-600 hover:text-teal-800 font-semibold whitespace-nowrap"
                          >
                            View tab →
                          </Link>
                        ) : null}
                      </td>
                    </tr>

                    {/* Expanded payment detail */}
                    {isExpanded && isSettled && (
                      <tr key={`${inv.id}-detail`} className="bg-slate-50/70">
                        <td colSpan={6} className="px-6 py-3">
                          <div className="flex flex-col gap-1.5">
                            {inv.payments.map((p, i) => (
                              <div key={i} className={`flex items-center justify-between text-xs ${p.voided ? 'opacity-40' : ''}`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {p.methods.map(m => (
                                    <span key={m} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${p.voided ? 'line-through' : ''} ${METHOD_COLORS[m] ?? DEFAULT_METHOD_COLOR}`}>
                                      {m}
                                    </span>
                                  ))}
                                  {p.voided && (
                                    <span className="px-1.5 py-0.5 bg-rose-100 text-rose-500 rounded text-[10px] font-bold uppercase tracking-wider">Voided</span>
                                  )}
                                  <span className="text-slate-400">
                                    {fmtDate(p.createdAt)} · {fmtTime(p.createdAt)}
                                    {p.recordedByEmail && <> · {p.recordedByEmail}</>}
                                  </span>
                                  {p.voided && p.voidReason && (
                                    <span className="text-rose-400 italic">"{p.voidReason}"</span>
                                  )}
                                </div>
                                <span className={`font-mono font-semibold ${p.voided ? 'line-through text-slate-400' : 'text-emerald-600'}`}>
                                  {fmtMoney(p.amount)}
                                </span>
                              </div>
                            ))}
                            {inv.clientId && (
                              <div className="mt-1 pt-1.5 border-t border-slate-200">
                                <Link
                                  href={`/pos/tabs?clientId=${inv.clientId}`}
                                  className="text-xs text-teal-600 hover:text-teal-800 font-semibold"
                                >
                                  Open client tab →
                                </Link>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
