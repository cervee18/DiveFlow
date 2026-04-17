'use client';

import { useState } from 'react';
import { fmtMoney } from './helpers';

interface Batch {
  recordedByEmail: string | null;
  addedAt: string;
  items: { name: string; price: number; qty: number }[];
}

interface StandaloneInvoice {
  invoiceId: string;
  createdAt: string;
  batches: Batch[];
  subtotal: number;
  paid: number;
  balance: number;
}

interface Props {
  invoice: StandaloneInvoice;
  isSelected: boolean;
  onToggle: (invoiceId: string, balance: number) => void;
}

function formatEmail(email: string | null) {
  if (!email) return 'Unknown staff';
  // Show just the part before @ for brevity
  return email.includes('@') ? email.split('@')[0] : email;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function StandaloneChargesCard({ invoice, isSelected, onToggle }: Props) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isPaid = invoice.balance <= 0;

  const batches = invoice.batches ?? [];
  const totalItems = batches.reduce((s, b) => s + b.items.length, 0);
  const dateLabel = new Date(invoice.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className={`border rounded-xl overflow-hidden shadow-sm ${isPaid ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
      {/* Header */}
      <div
        role="button"
        onClick={() => setIsExpanded(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full shrink-0 ${isPaid ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          <div>
            <p className="text-sm font-bold text-slate-800">{dateLabel}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {totalItems} item{totalItems !== 1 ? 's' : ''}
              {isPaid ? ' · Fully paid' : ` · ${fmtMoney(invoice.balance)} outstanding`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isPaid && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onToggle(invoice.invoiceId, invoice.balance); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all border shrink-0 ${
                isSelected
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-slate-300'}`} />
              {fmtMoney(invoice.balance)} due
            </button>
          )}
          {isPaid && (
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Paid</span>
          )}
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Batches */}
      {isExpanded && batches.length > 0 && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {batches.map((batch, bIdx) => (
            <div key={bIdx} className="px-5 py-3 space-y-1">
              {/* Batch header — who added it */}
              <p className="text-[11px] font-semibold text-slate-400 mb-1.5">
                {formatEmail(batch.recordedByEmail)}
                <span className="font-normal"> · {formatTime(batch.addedAt)}</span>
              </p>

              {batch.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center text-xs text-slate-500 px-2.5 py-1.5 bg-amber-50 rounded-lg border border-amber-100"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                    <span className="font-medium text-slate-700">
                      {item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}
                    </span>
                  </div>
                  <span className="font-mono shrink-0">{fmtMoney(item.price * item.qty)}</span>
                </div>
              ))}
            </div>
          ))}

          {/* Totals */}
          <div className="px-5 py-3 space-y-0.5">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-600">
              <span>Total</span>
              <span className="font-mono">{fmtMoney(invoice.subtotal)}</span>
            </div>
            {invoice.paid > 0 && (
              <div className="flex justify-between items-center text-xs text-emerald-600">
                <span>Paid</span>
                <span className="font-mono">−{fmtMoney(invoice.paid)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
