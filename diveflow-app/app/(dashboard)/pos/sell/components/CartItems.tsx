'use client';

import type { CartItem } from './types';

interface CartItemsProps {
  items: CartItem[];
  onUpdateQty: (i: number, qty: number) => void;
  onUpdatePrice: (i: number, raw: string) => void;
  onUpdatePriceBlur: (i: number) => void;
  onRemoveItem: (i: number) => void;
}

export default function CartItems({ items, onUpdateQty, onUpdatePrice, onUpdatePriceBlur, onRemoveItem }: CartItemsProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="w-16 h-16 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-slate-700">Cart is empty</h3>
        <p className="text-sm text-slate-400 mt-1">Tap a product from the catalog to add it</p>
      </div>
    );
  }

  const cartTotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="divide-y divide-slate-100">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-slate-700">{item.name}</span>
              {item.qty > 1 && (
                <span className="text-xs text-slate-400 ml-2">
                  × {item.qty} = <span className="font-mono">${(item.price * item.qty).toFixed(2)}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden h-7 w-20 bg-white">
                <button onClick={() => onUpdateQty(i, item.qty - 1)} className="w-7 h-full hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center font-bold text-sm transition-colors">-</button>
                <div className="flex-1 h-full flex items-center justify-center font-mono text-sm border-x border-slate-200 text-slate-700">{item.qty}</div>
                <button onClick={() => onUpdateQty(i, item.qty + 1)} className="w-7 h-full hover:bg-teal-50 text-slate-400 hover:text-teal-500 flex items-center justify-center font-bold text-sm transition-colors">+</button>
              </div>
              <div className="relative w-20">
                <span className="absolute inset-y-0 left-2 flex items-center text-slate-400 text-sm">$</span>
                <input
                  type="text"
                  value={item.priceStr ?? item.price.toFixed(2)}
                  onChange={e => onUpdatePrice(i, e.target.value)}
                  onBlur={() => onUpdatePriceBlur(i)}
                  className="w-full pl-5 pr-2 h-7 text-sm font-mono font-bold text-slate-800 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 bg-white"
                />
              </div>
              <button onClick={() => onRemoveItem(i)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
        <span className="text-sm font-semibold text-slate-600">Total</span>
        <span className="font-mono font-bold text-slate-800 text-lg">${cartTotal.toFixed(2)}</span>
      </div>
    </div>
  );
}
