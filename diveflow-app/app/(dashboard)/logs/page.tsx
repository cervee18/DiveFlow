'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import LogEntry, { type LogEntryData } from './components/LogEntry';

type Tab = 'all' | 'trip_client' | 'client' | 'staff_job';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all',         label: 'All' },
  { id: 'trip_client', label: 'Trips' },
  { id: 'client',      label: 'Clients' },
  { id: 'staff_job',   label: 'Staff' },
];

const PAGE_SIZE = 50;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDay(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function LogsPage() {
  const supabase = createClient();

  const [orgId,       setOrgId]       = useState<string | null>(null);
  const [activeTab,   setActiveTab]   = useState<Tab>('all');
  const [fromDate,    setFromDate]    = useState(() => shiftDay(todayStr(), -30));
  const [toDate,      setToDate]      = useState(todayStr);
  const [entries,     setEntries]     = useState<LogEntryData[]>([]);
  const [offset,      setOffset]      = useState(0);
  const [hasMore,     setHasMore]     = useState(false);
  const [isLoading,   setIsLoading]   = useState(false);

  // Fetch org ID once
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single();
      if (profile) setOrgId(profile.organization_id);
    }
    load();
  }, [supabase]);

  const fetchLogs = useCallback(async (newOffset: number, replace: boolean) => {
    if (!orgId) return;
    setIsLoading(true);

    // p_to is exclusive — add one day so "today" is included
    const toExclusive = new Date(toDate + 'T00:00:00');
    toExclusive.setDate(toExclusive.getDate() + 1);

    const { data, error } = await supabase.rpc('get_activity_logs', {
      p_org_id:      orgId,
      p_entity_type: activeTab === 'all' ? null : activeTab,
      p_from:        new Date(fromDate + 'T00:00:00').toISOString(),
      p_to:          toExclusive.toISOString(),
      p_limit:       PAGE_SIZE + 1,   // fetch one extra to detect hasMore
      p_offset:      newOffset,
    });

    setIsLoading(false);
    if (error || !data) return;

    const page = data as LogEntryData[];
    const hasNextPage = page.length > PAGE_SIZE;
    const rows = hasNextPage ? page.slice(0, PAGE_SIZE) : page;

    setEntries(prev => replace ? rows : [...prev, ...rows]);
    setOffset(newOffset + rows.length);
    setHasMore(hasNextPage);
  }, [orgId, activeTab, fromDate, toDate, supabase]);

  // Reset and reload when filters change
  useEffect(() => {
    setEntries([]);
    setOffset(0);
    fetchLogs(0, true);
  }, [orgId, activeTab, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-semibold text-slate-800">Activity Logs</h1>

          {/* Date range */}
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-500">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
            <label className="text-slate-500">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mt-3">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-teal-500 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Log feed */}
      <div className="flex-1 overflow-y-auto px-6 py-2">
        {/* Legend */}
        <div className="flex items-center gap-4 py-2 mb-1 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />Client added/removed</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-600 inline-block" />Trip created/deleted</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Client registered</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Staff assigned</span>
        </div>

        {isLoading && entries.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
        )}

        {!isLoading && entries.length === 0 && (
          <div className="py-16 text-center text-slate-400 text-sm">
            No activity found for this period.
          </div>
        )}

        {entries.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {entries.map(entry => (
              <LogEntry key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="py-4 text-center">
            <button
              onClick={() => fetchLogs(offset, false)}
              disabled={isLoading}
              className="px-4 py-2 rounded-md text-sm font-medium text-teal-600 border border-teal-300 hover:bg-teal-50 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}

        {/* Bottom padding */}
        <div className="h-6" />
      </div>
    </div>
  );
}
