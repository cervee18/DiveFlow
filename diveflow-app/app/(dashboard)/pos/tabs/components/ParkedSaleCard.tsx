'use client';

import { fmtMoney, timeAgo } from './helpers';

interface ParkedSaleCardProps {
  cart: any;
  onDelete: (cartId: string) => void;
}

export default function ParkedSaleCard({ cart, onDelete }: ParkedSaleCardProps) {
  const items: any[] = cart.pos_parked_cart_items ?? [];
  const total = items.reduce((s: number, i: any) => s + Number(i.unit_price) * i.quantity, 0);

  return (
    <div className="bg-white border border-amber-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-slate-800 text-sm">{cart.label}</p>
          <p className="text-xs text-slate-400">{items.length} item{items.length !== 1 ? 's' : ''} · {timeAgo(cart.created_at)}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-slate-700">{fmtMoney(total)}</span>
          <button
            onClick={() => onDelete(cart.id)}
            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      <div className="px-5 pb-3 space-y-1">
        {items.map((item: any, idx: number) => (
          <div key={idx} className="flex justify-between text-xs text-slate-500">
            <span>{item.quantity > 1 ? `${item.quantity}× ` : ''}{item.pos_products?.name}</span>
            <span className="font-mono">{fmtMoney(Number(item.unit_price) * item.quantity)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
