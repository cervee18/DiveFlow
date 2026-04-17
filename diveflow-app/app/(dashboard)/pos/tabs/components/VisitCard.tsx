'use client';

import { useState, useEffect } from 'react';
import { formatDate, fmtMoney } from './helpers';
import type { VisitSelection, VisitMemberSelection } from './types';
import InlineProductAdd from './InlineProductAdd';

interface VisitCardProps {
  visit: { visitId: string; startDate: string; endDate: string; payload: any };
  selectedClientId: string;
  products: any[];
  onSelectionChange: (sel: VisitSelection) => void;
  onAddItem: (visitId: string, invoiceId: string | null, clientId: string, productId: string, price: number, qty: number) => Promise<void>;
  onWaiveItem: (visitId: string, clientId: string, itemKey: string, waived: boolean) => Promise<void>;
  onDeleteItem: (invoiceItemId: string) => Promise<void>;
}

export default function VisitCard({ visit, selectedClientId, products, onSelectionChange, onAddItem, onWaiveItem, onDeleteItem }: VisitCardProps) {
  const { payload } = visit;
  const clients: Record<string, any> = payload.clients ?? {};
  const memberIds = Object.keys(clients);

  const [isExpanded, setIsExpanded] = useState(true);
  const [toggledIds, setToggledIds] = useState<Set<string>>(() => new Set(memberIds));
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(() => new Set());

  const sharedItems: any[] = payload.shared_group_items ?? [];
  const unassignedPayments: any[] = payload.unassigned_payments ?? [];
  const grandTotals = payload.grand_totals ?? {};

  const totalBalance = Math.round((grandTotals.master_balance ?? 0) * 100) / 100;
  const isPaid = totalBalance <= 0;

  const calcSelection = (toggled: Set<string>): { balance: number; members: VisitMemberSelection[] } => {
    const members: VisitMemberSelection[] = [];
    let balance = 0;
    for (const id of memberIds) {
      if (!toggled.has(id)) continue;
      const due = Math.round((clients[id]?.totals?.balance_due ?? 0) * 100) / 100;
      if (due > 0) {
        balance += due;
        members.push({ clientId: id, balanceDue: due });
      }
    }
    return { balance: Math.round(balance * 100) / 100, members };
  };

  const toggleMember = (id: string) => {
    setToggledIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      const { balance, members } = calcSelection(next);
      onSelectionChange({ visitId: visit.visitId, invoiceId: payload.invoice_id ?? null, balance, members });
      return next;
    });
  };

  const toggleMemberExpand = (id: string) => {
    setExpandedMembers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Re-report selection whenever visit data changes (initial mount + silent refreshes)
  useEffect(() => {
    const { balance, members } = calcSelection(toggledIds);
    onSelectionChange({ visitId: visit.visitId, invoiceId: payload.invoice_id ?? null, balance, members });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit]);

  return (
    <div className={`border rounded-xl overflow-hidden shadow-sm ${isPaid ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(p => !p)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full shrink-0 ${isPaid ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          <div>
            <p className="text-sm font-bold text-slate-800">
              {formatDate(visit.startDate)} — {formatDate(visit.endDate)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {memberIds.length} member{memberIds.length !== 1 ? 's' : ''} · {isPaid ? 'Fully paid' : `${fmtMoney(totalBalance)} outstanding`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isPaid && <span className="text-sm font-black font-mono text-rose-600">{fmtMoney(totalBalance)}</span>}
          {isPaid && <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Paid</span>}
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {memberIds.map(memberId => {
            const member = clients[memberId];
            const autoItems: any[] = member.automated_items ?? [];
            const manualItems: any[] = member.manual_items ?? [];
            const memberPayments: any[] = member.payments ?? [];
            const totals = member.totals ?? {};
            const isCurrentClient = memberId === selectedClientId;
            const isToggled = toggledIds.has(memberId);
            const memberBalance = Math.round((totals.balance_due ?? 0) * 100) / 100;
            const hasItems = autoItems.length > 0 || manualItems.length > 0 || memberPayments.length > 0;
            const isMemberExpanded = expandedMembers.has(memberId);
            const itemCount = autoItems.length + manualItems.length;

            return (
              <div key={memberId} className={isCurrentClient ? 'bg-teal-50/40' : ''}>
                {/* Member header row */}
                <div className="flex items-center gap-2 px-5 py-3">
                  <button
                    onClick={() => toggleMember(memberId)}
                    disabled={memberBalance <= 0}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all border shrink-0 disabled:opacity-40 disabled:cursor-default ${
                      isToggled && memberBalance > 0
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isToggled && memberBalance > 0 ? 'bg-white' : 'bg-slate-300'}`} />
                    {member.client_name}
                    {isCurrentClient && <span className="opacity-60 ml-0.5">(you)</span>}
                  </button>

                  <button
                    onClick={() => toggleMemberExpand(memberId)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors ml-0.5"
                  >
                    <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                    <svg className={`w-3.5 h-3.5 transition-transform ${isMemberExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  <div className="ml-auto text-right shrink-0">
                    <p className="text-xs text-slate-400">
                      <span className="font-mono font-semibold text-slate-700">{fmtMoney(totals.subtotal ?? 0)}</span>
                    </p>
                    {memberBalance > 0 && (
                      <p className="text-xs font-bold font-mono text-rose-500">{fmtMoney(memberBalance)} due</p>
                    )}
                    {memberBalance <= 0 && (totals.subtotal ?? 0) > 0 && (
                      <p className="text-xs font-semibold text-emerald-600">paid</p>
                    )}
                  </div>
                </div>

                {/* Expandable section */}
                {isMemberExpanded && (
                  <div className="px-5 pb-3 space-y-2">
                    {/* Inline product add */}
                    <InlineProductAdd
                      products={products}
                      onAdd={(productId, price, qty) =>
                        onAddItem(visit.visitId, payload.invoice_id ?? null, memberId, productId, price, qty)
                      }
                    />

                    {/* Line items */}
                    <div className="space-y-1">
                    {autoItems.map((item: any, idx: number) => (
                      <div key={`a-${idx}`} className={`flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg ${item.waived ? 'bg-slate-50 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-1 h-1 rounded-full shrink-0 ${item.waived ? 'bg-slate-200' : 'bg-slate-300'}`} />
                          <span className={`font-medium ${item.waived ? 'line-through text-slate-400' : 'text-slate-700'}`}>{item.name}</span>
                          {item.waived && <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full shrink-0">Waived</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.trip_date && <span className="text-slate-400">{formatDate(item.trip_date.split('T')[0])}</span>}
                          <span className={`font-mono ${item.waived ? 'line-through text-slate-300' : ''}`}>{fmtMoney(item.price ?? 0)}</span>
                          {item.item_key && (
                            <button
                              onClick={() => onWaiveItem(visit.visitId, memberId, item.item_key, !item.waived)}
                              title={item.waived ? 'Restore charge' : 'Waive'}
                              className={`p-1 rounded transition-colors ${item.waived ? 'text-teal-500 hover:text-slate-400 hover:bg-slate-100' : 'text-slate-400 hover:text-teal-500 hover:bg-teal-50'}`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                {item.waived
                                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                                  : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />}
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {manualItems.map((item: any, idx: number) => (
                      <div key={`m-${idx}`} className="flex justify-between items-center text-xs text-slate-500 px-2.5 py-1.5 bg-amber-50 rounded-lg border border-amber-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                          <span className="font-medium text-slate-700">{item.name}{item.qty > 1 ? ` ×${item.qty}` : ''}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono">{fmtMoney((item.price ?? 0) * (item.qty ?? 1))}</span>
                          {item.item_id && (
                            <button
                              onClick={() => onDeleteItem(item.item_id)}
                              title="Remove item"
                              className="p-1 rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {memberPayments.map((p: any, idx: number) => (
                      <div key={`p-${idx}`} className="flex justify-between items-center text-xs text-emerald-600 px-2.5 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
                          <span className="font-medium">{p.method} payment</span>
                        </div>
                        <span className="font-mono">−{fmtMoney(p.amount)}</span>
                      </div>
                    ))}
                    {!hasItems && <p className="text-xs text-slate-400 italic px-2">No charges yet</p>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {sharedItems.length > 0 && (
            <div className="px-5 py-3 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 mb-2">Shared / Group Items</p>
              {sharedItems.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-xs text-slate-600 py-1">
                  <span>{item.name} {item.qty > 1 ? `×${item.qty}` : ''}</span>
                  <span className="font-mono">{fmtMoney((item.price ?? 0) * (item.qty ?? 1))}</span>
                </div>
              ))}
            </div>
          )}

          {unassignedPayments.length > 0 && (
            <div className="px-5 py-3 bg-emerald-50/50">
              <p className="text-xs font-semibold text-emerald-600 mb-2">Group Payments</p>
              {unassignedPayments.map((p: any, idx: number) => (
                <div key={idx} className="flex justify-between text-xs text-emerald-700 py-1">
                  <span>{p.method} · {formatDate((p.date ?? '').split('T')[0])}</span>
                  <span className="font-mono">−{fmtMoney(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
