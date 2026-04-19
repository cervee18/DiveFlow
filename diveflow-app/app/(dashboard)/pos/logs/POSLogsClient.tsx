'use client';

import { useState, useMemo } from 'react';

interface LogRow {
  id: string;
  action: string;
  actorEmail: string | null;
  clientId: string | null;
  clientName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface Props {
  logs: LogRow[];
}

// ── Action config ─────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  payment:      { label: 'Payment',      color: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  checkout:     { label: 'Checkout',     color: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  void_payment: { label: 'Void Payment', color: 'bg-rose-100 text-rose-700 ring-rose-200' },
  deposit:      { label: 'Deposit',      color: 'bg-blue-100 text-blue-700 ring-blue-200' },
  void_deposit: { label: 'Void Deposit', color: 'bg-rose-100 text-rose-700 ring-rose-200' },
  waive_item:   { label: 'Waive',        color: 'bg-amber-100 text-amber-700 ring-amber-200' },
  unwaive_item: { label: 'Unwaive',      color: 'bg-slate-100 text-slate-600 ring-slate-200' },
  price_override: { label: 'Price Edit', color: 'bg-purple-100 text-purple-700 ring-purple-200' },
  edit_item:    { label: 'Edit Item',    color: 'bg-teal-100 text-teal-700 ring-teal-200' },
  delete_item:  { label: 'Delete Item',  color: 'bg-rose-100 text-rose-700 ring-rose-200' },
  open_session: { label: 'Open POS',     color: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  close_session: { label: 'Close POS',  color: 'bg-slate-100 text-slate-600 ring-slate-200' },
  add_to_tab:   { label: 'Add to Tab',   color: 'bg-teal-100 text-teal-700 ring-teal-200' },
};

const ALL_ACTIONS = Object.keys(ACTION_CONFIG);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n: unknown) {
  const v = Number(n);
  return isNaN(v) ? '—' : `$${v.toFixed(2)}`;
}

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function buildDetails(action: string, meta: Record<string, unknown>): string {
  switch (action) {
    case 'payment':
    case 'checkout': {
      const splits = meta.splits as { method: string; amount: number }[] | undefined;
      if (splits && splits.length > 0) {
        return splits.map(s => `${fmtMoney(s.amount)} ${s.method}`).join(' + ');
      }
      return meta.amount ? `${fmtMoney(meta.amount)} via ${meta.method ?? '—'}` : '—';
    }
    case 'void_payment':
      return `${fmtMoney(meta.amount)} · ${meta.reason ?? ''}`;
    case 'deposit':
      return `${fmtMoney(meta.amount)} via ${meta.method ?? '—'}${meta.note ? ` · "${meta.note}"` : ''}`;
    case 'void_deposit':
      return `${fmtMoney(meta.amount)} · ${meta.reason ?? ''}`;
    case 'waive_item':
    case 'unwaive_item': {
      const label = meta.item_name
        ? String(meta.item_name)
        : String(meta.item_key ?? '').split(':')[0].replace(/_/g, ' ') || '—';
      return label;
    }
    case 'price_override': {
      const label = meta.item_name
        ? String(meta.item_name)
        : String(meta.item_key ?? '').split(':')[0].replace(/_/g, ' ') || '—';
      return `${label} → ${fmtMoney(meta.new_price)}`;
    }
    case 'edit_item':
      return `${String(meta.product_name ?? '—')} → ${fmtMoney(meta.unit_price)} ×${meta.qty ?? 1}`;
    case 'delete_item':
      return `${String(meta.product_name ?? '—')} (${fmtMoney(meta.unit_price)} ×${meta.qty ?? 1})`;
    case 'open_session':
      return `Opening cash: ${fmtMoney(meta.opening_cash)}`;
    case 'close_session':
      return '—';
    case 'add_to_tab':
      return `${meta.item_count ?? 0} item${Number(meta.item_count) !== 1 ? 's' : ''} · ${fmtMoney(meta.total)}`;
    default:
      return JSON.stringify(meta);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function POSLogsClient({ logs }: Props) {
  const [dateFilter, setDateFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');

  const uniqueActors = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) if (l.actorEmail) set.add(l.actorEmail);
    return [...set].sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (dateFilter && fmtDate(l.createdAt) !== dateFilter) return false;
      if (actionFilter && l.action !== actionFilter) return false;
      if (actorFilter && l.actorEmail !== actorFilter) return false;
      return true;
    });
  }, [logs, dateFilter, actionFilter, actorFilter]);

  const hasFilters = dateFilter || actionFilter || actorFilter;

  return (
    <div className="flex flex-col h-full gap-4">

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          <option value="">All actions</option>
          {ALL_ACTIONS.map(a => (
            <option key={a} value={a}>{ACTION_CONFIG[a].label}</option>
          ))}
        </select>
        <select
          value={actorFilter}
          onChange={e => setActorFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          <option value="">All staff</option>
          {uniqueActors.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setDateFilter(''); setActionFilter(''); setActorFilter(''); }}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">{filtered.length} entries</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-2">
            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {hasFilters ? 'No entries match your filters.' : 'No activity logged yet.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left w-40">Time</th>
                <th className="px-4 py-3 text-left w-32">Action</th>
                <th className="px-4 py-3 text-left">Details</th>
                <th className="px-4 py-3 text-left w-44">Client</th>
                <th className="px-4 py-3 text-left w-44">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(log => {
                const cfg = ACTION_CONFIG[log.action] ?? { label: log.action, color: 'bg-slate-100 text-slate-600 ring-slate-200' };
                return (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs whitespace-nowrap">
                      {fmtDatetime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-xs truncate">
                      {buildDetails(log.action, log.metadata)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[11rem]">
                      {log.clientName ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[11rem]">
                      {log.actorEmail ?? <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
