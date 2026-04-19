'use client';

import { useState } from 'react';
import { fmtMoney } from './helpers';

interface EditItemModalProps {
  item: { id: string; name: string; price: number; qty: number; basePrice?: number };
  mode?: 'manual' | 'auto';
  isPending: boolean;
  onConfirm: (id: string, unitPrice: number, qty: number) => void;
  onClose: () => void;
}

export default function EditItemModal({ item, mode = 'manual', isPending, onConfirm, onClose }: EditItemModalProps) {
  const [qty, setQty] = useState(item.qty);
  const [unitPrice, setUnitPrice] = useState(item.price);
  const [discountPct, setDiscountPct] = useState(0);

  // Base price is the original computed/catalog price; used to show reference + calculate discounts
  const basePrice = item.basePrice ?? item.price;

  const handleDiscountChange = (raw: string) => {
    const pct = Math.min(100, Math.max(0, parseFloat(raw) || 0));
    setDiscountPct(pct);
    setUnitPrice(Math.round(basePrice * (1 - pct / 100) * 100) / 100);
  };

  const handlePriceChange = (raw: string) => {
    const price = Math.max(0, parseFloat(raw) || 0);
    setUnitPrice(price);
    const pct = basePrice > 0 ? Math.round(((basePrice - price) / basePrice) * 10000) / 100 : 0;
    setDiscountPct(Math.max(0, pct));
  };

  const total = Math.round(unitPrice * qty * 100) / 100;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Edit Item</p>
            <h2 className="text-sm font-bold text-slate-800 mt-0.5">{item.name}</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Original price reference */}
          <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
            <span>Original price</span>
            <span className="font-mono font-semibold">{fmtMoney(basePrice)}</span>
          </div>

          {/* Qty — manual items only */}
          {mode === 'manual' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Quantity</label>
              <input
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          )}

          {/* Discount % */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Discount %</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={discountPct === 0 ? '' : discountPct}
                placeholder="0"
                onChange={e => handleDiscountChange(e.target.value)}
                className="w-full px-3 py-2 pr-8 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
            </div>
          </div>

          {/* Unit price */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Unit Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={unitPrice}
                onChange={e => handlePriceChange(e.target.value)}
                className="w-full pl-7 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>

          {/* Total preview */}
          <div className="flex items-center justify-between text-sm font-bold bg-teal-50 border border-teal-100 rounded-lg px-4 py-2.5">
            <span className="text-teal-700">New total</span>
            <span className="font-mono text-teal-800">{fmtMoney(total)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onConfirm(item.id, unitPrice, qty)}
            className="px-4 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
