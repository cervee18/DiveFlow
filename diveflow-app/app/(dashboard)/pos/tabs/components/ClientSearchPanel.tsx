'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { fmtMoney } from './helpers';
import type { Client } from './types';

interface ClientSearchPanelProps {
  searchText: string;
  searchResults: Client[];
  isDropdownOpen: boolean;
  selectedClient: Client | null;
  tabData: any | null;
  visits: any[];
  parkedCarts: any[];
  parkedTotal: number;
  totalOutstanding: number;
  onSearchChange: (val: string) => void;
  onDropdownOpen: () => void;
  onDropdownClose: () => void;
  onSelectClient: (c: Client) => void;
  onClearClient: () => void;
}

export default function ClientSearchPanel({
  searchText,
  searchResults,
  isDropdownOpen,
  selectedClient,
  tabData,
  visits,
  parkedCarts,
  parkedTotal,
  totalOutstanding,
  onSearchChange,
  onDropdownOpen,
  onDropdownClose,
  onSelectClient,
  onClearClient,
}: ClientSearchPanelProps) {
  return (
    <div className="w-80 shrink-0 flex flex-col gap-4">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Client</p>

        {selectedClient && tabData ? (
          /* ── Selected state: avatar + name + balance ── */
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-teal-100 rounded-full flex items-center justify-center shrink-0">
                <span className="text-teal-700 font-bold text-sm">{selectedClient.name.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/clients?clientId=${selectedClient.id}`} className="font-bold text-slate-800 text-sm hover:text-teal-600 hover:underline transition-colors">
                  {selectedClient.name}
                </Link>
                <p className="text-xs text-slate-400 mt-0.5">
                  {visits.length} visit{visits.length !== 1 ? 's' : ''}
                  {parkedCarts.length > 0 && ` · ${parkedCarts.length} parked`}
                </p>
              </div>
              <button onClick={onClearClient} className="shrink-0 p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {totalOutstanding > 0 ? (
              <div className="bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 flex justify-between items-center">
                <div>
                  <p className="text-xs font-semibold text-rose-600">Total outstanding</p>
                  {parkedTotal > 0 && <p className="text-[10px] text-rose-400 mt-0.5">incl. {fmtMoney(parkedTotal)} parked</p>}
                </div>
                <span className="text-base font-black font-mono text-rose-600">{fmtMoney(totalOutstanding)}</span>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-semibold text-emerald-600">All paid up</span>
              </div>
            )}
          </div>
        ) : (
          /* ── Search state: input + dropdown ── */
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchText}
              onChange={e => onSearchChange(e.target.value)}
              onFocus={onDropdownOpen}
              onBlur={() => setTimeout(onDropdownClose, 150)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            {isDropdownOpen && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-30">
                <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {searchResults.map(c => (
                    <li key={c.id}>
                      <button
                        onMouseDown={() => onSelectClient(c)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors"
                      >
                        <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                        {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
