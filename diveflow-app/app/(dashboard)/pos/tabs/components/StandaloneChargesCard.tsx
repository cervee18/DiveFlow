'use client';

import { useState } from 'react';
import { fmtMoney } from './helpers';

interface BatchItem {
  id: string;
  name: string;
  price: number;
  basePrice: number;
  qty: number;
}

interface Batch {
  recordedByEmail: string | null;
  addedAt: string;
  items: BatchItem[];
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
  onEditItem: (item: { id: string; name: string; price: number; qty: number; basePrice: number }) => void;
  onDeleteItem: (invoiceItemId: string) => void;
}

function formatEmail(email: string | null) {
  if (!email) return 'Unknown staff';
  // Show just the part before @ for brevity
  return email.includes('@') ? email.split('@')[0] : email;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function StandaloneChargesCard({ invoice, isSelected, onToggle, onEditItem, onDeleteItem }: Props) {
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

              {batch.items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center text-xs text-slate-500 px-2.5 py-1.5 bg-amber-50 rounded-lg border border-amber-100"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                    <span className="font-medium text-slate-700 truncate">
                      {item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="font-mono mr-1">{fmtMoney(item.price * item.qty)}</span>
                    <button
                      onClick={() => onEditItem(item)}
                      title="Edit item"
                      className="p-1 rounded text-slate-300 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDeleteItem(item.id)}
                      title="Remove item"
                      className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
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
