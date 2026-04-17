'use client';

import { useState, useMemo } from 'react';

interface InlineProductAddProps {
  products: any[];
  onAdd: (productId: string, price: number, qty: number) => Promise<void>;
}

export default function InlineProductAdd({ products, onAdd }: InlineProductAddProps) {
  const [search, setSearch] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [pending, setPending] = useState<{
    id: string; name: string; price: number; priceStr: string; qty: number;
  } | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    return products
      .filter(p => p.is_active !== false && p.name.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 8);
  }, [search, products]);

  const selectProduct = (p: any) => {
    setPending({ id: p.id, name: p.name, price: Number(p.price), priceStr: Number(p.price).toFixed(2), qty: 1 });
    setSearch('');
    setIsFocused(false);
  };

  const handleAdd = async () => {
    if (!pending || isAdding) return;
    setIsAdding(true);
    await onAdd(pending.id, pending.price, pending.qty);
    setPending(null);
    setIsAdding(false);
  };

  return (
    <div className="space-y-2">
      {/* Search input — hidden while a pending item is staged */}
      {!pending && (
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Add product..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 150)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 placeholder-slate-400"
          />
          {isFocused && filtered.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+2px)] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-20">
              <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {filtered.map(p => (
                  <li key={p.id}>
                    <button
                      onMouseDown={() => selectProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-4"
                    >
                      <span className="text-xs font-semibold text-slate-700 truncate">{p.name}</span>
                      <span className="text-xs font-mono text-slate-400 shrink-0">${Number(p.price).toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isFocused && search.trim().length > 0 && filtered.length === 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+2px)] bg-white border border-slate-200 rounded-xl shadow-xl z-20 px-3 py-2.5">
              <p className="text-xs text-slate-400 italic">No products found</p>
            </div>
          )}
        </div>
      )}

      {/* Staged item row */}
      {pending && (
        <div className="flex items-center gap-2 px-2.5 py-2 bg-teal-50 border border-teal-200 rounded-lg">
          <span className="text-xs font-semibold text-slate-700 flex-1 min-w-0 truncate">{pending.name}</span>

          {/* Qty stepper */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden h-6 bg-white shrink-0">
            <button
              onClick={() => setPending(p => p && p.qty > 1 ? { ...p, qty: p.qty - 1 } : p)}
              className="w-6 h-full hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center font-bold text-sm transition-colors"
            >−</button>
            <div className="px-2 h-full flex items-center justify-center font-mono text-xs border-x border-slate-200 text-slate-700 min-w-[1.5rem] text-center">{pending.qty}</div>
            <button
              onClick={() => setPending(p => p ? { ...p, qty: p.qty + 1 } : p)}
              className="w-6 h-full hover:bg-teal-50 text-slate-400 hover:text-teal-500 flex items-center justify-center font-bold text-sm transition-colors"
            >+</button>
          </div>

          {/* Price input */}
          <div className="relative w-20 shrink-0">
            <span className="absolute inset-y-0 left-1.5 flex items-center text-slate-400 text-xs pointer-events-none">$</span>
            <input
              type="number" min="0" step="0.01"
              value={pending.priceStr}
              onChange={e => setPending(p => p ? { ...p, priceStr: e.target.value, price: parseFloat(e.target.value) || 0 } : p)}
              onBlur={() => setPending(p => p ? { ...p, priceStr: p.price.toFixed(2) } : p)}
              className="w-full pl-4 pr-1 py-1 text-xs font-mono border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-400"
            />
          </div>

          {/* Confirm */}
          <button
            onClick={handleAdd}
            disabled={isAdding || pending.price <= 0}
            className="shrink-0 h-6 px-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-colors"
          >
            {isAdding ? '…' : 'Add'}
          </button>

          {/* Cancel */}
          <button
            onClick={() => setPending(null)}
            className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
