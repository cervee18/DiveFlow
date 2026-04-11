'use client';

import type { Client } from './types';

interface ParkedPanelProps {
  parkedCarts: any[];
  clients: Client[];
  onClose: () => void;
  onResume: (cart: any) => void;
  onDelete: (cartId: string) => void;
}

export default function ParkedPanel({ parkedCarts, clients, onClose, onResume, onDelete }: ParkedPanelProps) {
  return (
    <div className="absolute inset-0 z-40 flex">
      <div className="flex-1 bg-slate-900/20" onClick={onClose} />
      <div className="w-80 bg-white border-l border-slate-200 shadow-xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-slate-800">Parked Tabs</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {parkedCarts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <p className="text-sm font-semibold text-slate-500">No parked tabs</p>
              <p className="text-xs text-slate-400 mt-1">Park a sale to hold it here</p>
            </div>
          ) : parkedCarts.map(cart => {
            const items = (cart.pos_parked_cart_items as any[]) ?? [];
            const total = items.reduce((s: number, i: any) => s + Number(i.unit_price) * i.quantity, 0);
            const mins = Math.floor((Date.now() - new Date(cart.created_at).getTime()) / 60000);
            const timeLabel = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins / 60)}h ago` : `${Math.floor(mins / 1440)}d ago`;
            return (
              <div key={cart.id} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{cart.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{items.length} item{items.length !== 1 ? 's' : ''} · {timeLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-700 text-sm">${total.toFixed(2)}</span>
                    <button onClick={() => onDelete(cart.id)} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="px-4 pb-2 space-y-1">
                  {items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs text-slate-500">
                      <span>{item.quantity > 1 ? `${item.quantity}× ` : ''}{item.pos_products?.name}</span>
                      <span className="font-mono">${(Number(item.unit_price) * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t border-slate-100">
                  <button onClick={() => onResume(cart)} className="w-full py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold rounded-lg transition-colors">Resume</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
