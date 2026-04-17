'use client';

import type { Client } from './types';

interface CartHeaderProps {
  clientSearchText: string;
  isSearchFocused: boolean;
  selectedClient: Client | null;
  matchingClients: Client[];
  parkedCartsCount: number;
  onSearchChange: (v: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onSelectClient: (c: Client) => void;
  onClearClient: () => void;
  onOpenParked: () => void;
}

export default function CartHeader({
  clientSearchText,
  isSearchFocused,
  selectedClient,
  matchingClients,
  parkedCartsCount,
  onSearchChange,
  onSearchFocus,
  onSearchBlur,
  onSelectClient,
  onClearClient,
  onOpenParked,
}: CartHeaderProps) {
  return (
    <div className="px-6 py-4 border-b border-slate-100 bg-white shrink-0 relative z-20">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Attribute to a client (optional)..."
            value={clientSearchText}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={onSearchFocus}
            onBlur={() => setTimeout(onSearchBlur, 150)}
            className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
          {selectedClient && (
            <button onClick={onClearClient} className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <svg className="w-4 h-4 text-slate-400 hover:text-rose-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {isSearchFocused && matchingClients.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-30">
              <ul className="divide-y divide-slate-100">
                {matchingClients.map(c => (
                  <li key={c.id}>
                    <button
                      onMouseDown={() => onSelectClient(c)}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm font-semibold text-slate-800"
                    >{c.name}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {selectedClient ? (
          <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            Tab Locked
          </span>
        ) : (
          <span className="shrink-0 inline-flex items-center px-3 py-1.5 bg-slate-100 text-slate-500 text-xs font-semibold rounded-lg border border-slate-200">
            Walk-In
          </span>
        )}

        <button
          onClick={onOpenParked}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1.343 9.01A2 2 0 008.33 19h7.34a2 2 0 001.987-1.99L19 8" />
          </svg>
          Parked
          {parkedCartsCount > 0 && (
            <span className="bg-amber-400 text-amber-900 text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center">{parkedCartsCount}</span>
          )}
        </button>
      </div>
    </div>
  );
}
