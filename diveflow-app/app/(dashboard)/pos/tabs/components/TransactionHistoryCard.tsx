'use client';

import { useState } from 'react';
import { fmtMoney } from './helpers';

interface HistoryItem {
  name: string;
  price: number;
  clientName: string | null;
  discountPct?: number;
}

export interface PaymentRow {
  ids: string[];
  date: string;
  amount: number;
  splits: { method: string; amount: number }[];
  recordedByEmail: string | null;
  voided: boolean;
  voidReason: string | null;
}

export interface HistoryEntry {
  invoiceId: string;
  context: string | null;
  items: HistoryItem[];
  totalCharged: number;
  payments: PaymentRow[];
  totalPaid: number;
  lastDate: string;
}

function fmtDiscount(pct: number) {
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`;
}

interface Props {
  entry: HistoryEntry;
  onVoid: (row: PaymentRow) => void;
  onReceipt: (invoiceId: string) => void;
  onEmailReceipt?: (invoiceId: string) => Promise<void>;
}

function formatEmail(email: string | null) {
  if (!email) return null;
  return email.includes('@') ? email.split('@')[0] : email;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function TransactionHistoryCard({ entry, onVoid, onReceipt, onEmailReceipt }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<'sent' | 'error' | null>(null);

  const handleEmailReceipt = async () => {
    if (!onEmailReceipt) return;
    setIsEmailing(true);
    setEmailFeedback(null);
    try {
      await onEmailReceipt(entry.invoiceId);
      setEmailFeedback('sent');
      setTimeout(() => setEmailFeedback(null), 3000);
    } catch {
      setEmailFeedback('error');
      setTimeout(() => setEmailFeedback(null), 3000);
    } finally {
      setIsEmailing(false);
    }
  };

  const hasMultipleClients = new Set(entry.items.map(i => i.clientName).filter(Boolean)).size > 1;
  const activePayments = entry.payments.filter(p => !p.voided);
  const balance = Math.round((entry.totalCharged - entry.totalPaid) * 100) / 100;
  const isFullyPaid = entry.totalCharged > 0 && balance <= 0;

  // Card header date = date of first payment
  const firstDate = entry.payments[0]?.date ?? entry.lastDate;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
      {/* Header */}
      <div
        role="button"
        onClick={() => setIsExpanded(p => !p)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800">{formatDate(firstDate)}</p>
              {entry.context && (
                <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                  {entry.context}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {entry.items.length} item{entry.items.length !== 1 ? 's' : ''}
              {' · '}
              {activePayments.length} payment{activePayments.length !== 1 ? 's' : ''}
              {isFullyPaid ? ' · Settled' : balance > 0 ? ` · ${fmtMoney(balance)} remaining` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onReceipt(entry.invoiceId); }}
            className="text-xs font-semibold text-slate-400 hover:text-indigo-600 transition-colors px-1.5 py-0.5 rounded hover:bg-indigo-50"
            title="Print receipt"
          >
            Receipt
          </button>
          {onEmailReceipt && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); handleEmailReceipt(); }}
              disabled={isEmailing}
              className={`text-xs font-semibold transition-colors px-1.5 py-0.5 rounded disabled:opacity-50 ${
                emailFeedback === 'sent' ? 'text-emerald-600 bg-emerald-50' :
                emailFeedback === 'error' ? 'text-rose-500 bg-rose-50' :
                'text-slate-400 hover:text-teal-600 hover:bg-teal-50'
              }`}
              title="Email receipt to client"
            >
              {isEmailing ? '...' : emailFeedback === 'sent' ? 'Sent!' : emailFeedback === 'error' ? 'Failed' : 'Email'}
            </button>
          )}
          <span className="text-sm font-black font-mono text-emerald-600">
            {fmtMoney(entry.totalPaid)}
          </span>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">

          {/* Items */}
          {entry.items.length > 0 && (
            <div className="px-5 py-3 space-y-1">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Charges</p>
              {entry.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs text-slate-500 px-2.5 py-1.5 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                    <span className="font-medium text-slate-700 truncate">{item.name}</span>
                    {item.discountPct !== undefined && item.discountPct > 0 && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">
                        -{fmtDiscount(item.discountPct)}
                      </span>
                    )}
                    {hasMultipleClients && item.clientName && (
                      <span className="text-slate-400 shrink-0">({item.clientName})</span>
                    )}
                  </div>
                  <span className="font-mono shrink-0 ml-2">{fmtMoney(item.price)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center text-xs font-semibold text-slate-600 px-2.5 pt-1.5 border-t border-slate-100">
                <span>Total charged</span>
                <span className="font-mono">{fmtMoney(entry.totalCharged)}</span>
              </div>
            </div>
          )}

          {/* Payments */}
          <div className="px-5 py-3 space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Payments</p>
            {entry.payments.map((row, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between text-xs px-2.5 py-2 rounded-lg border ${
                  row.voided
                    ? 'bg-slate-50 border-slate-100 opacity-50'
                    : 'bg-emerald-50 border-emerald-100'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1 h-1 rounded-full shrink-0 ${row.voided ? 'bg-slate-300' : 'bg-emerald-400'}`} />
                  <div className="min-w-0">
                    <div className={`font-medium ${row.voided ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                      {row.splits.length === 1 ? (
                        <span>{row.splits[0].method}</span>
                      ) : (
                        <span className="flex flex-wrap gap-x-2">
                          {row.splits.map(s => (
                            <span key={s.method}>{s.method} <span className="font-mono">{fmtMoney(s.amount)}</span></span>
                          ))}
                        </span>
                      )}
                      {formatEmail(row.recordedByEmail) && (
                        <span className="font-normal text-slate-400"> · by {formatEmail(row.recordedByEmail)}</span>
                      )}
                    </div>
                    <p className="text-slate-400">
                      {formatDate(row.date)} · {formatTime(row.date)}
                      {row.voided && row.voidReason && ` · ${row.voidReason}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`font-mono font-semibold ${row.voided ? 'line-through text-slate-400' : 'text-emerald-700'}`}>
                    {fmtMoney(row.amount)}
                  </span>
                  {!row.voided && (
                    <button
                      type="button"
                      onClick={() => onVoid(row)}
                      className="text-xs text-slate-300 hover:text-rose-500 transition-colors px-1 py-0.5 rounded hover:bg-rose-50"
                    >
                      Void
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
