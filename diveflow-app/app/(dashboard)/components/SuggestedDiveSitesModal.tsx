'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useOrgSettings, formatDepth } from '@/app/(dashboard)/components/OrgSettingsContext';

// 60 ft = 18.288 m — compare in rounded feet to avoid float round-trip noise
const isDeepSite = (metres: number) => Math.round(metres / 0.3048) > 60;

interface SiteResult {
  id: string;
  name: string;
  max_depth: number;
  group_id: string | null;
  group_name: string | null;
  unseen_count: number;
  total_past_visits: number;
}

function categoryOf(site: SiteResult): string {
  if (!site.group_name) return '__all__';
  return `${site.group_name} ${isDeepSite(site.max_depth) ? 'Deep' : 'Shallow'}`;
}

// Stable order for category headings
function sortCategories(cats: string[]): string[] {
  const order = ['North Deep', 'North Shallow', 'South Deep', 'South Shallow'];
  return cats.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default function SuggestedDiveSitesModal({
  tripId,
  onClose,
}: {
  tripId: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const { unitSystem } = useOrgSettings();

  const [results,      setResults]      = useState<SiteResult[]>([]);
  const [totalClients, setTotalClients] = useState(0);
  const [isLoading,    setIsLoading]    = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.rpc('suggest_divesites', { p_trip_id: tripId }),
      supabase.from('trip_clients').select('id', { count: 'exact', head: true }).eq('trip_id', tripId),
    ]).then(([{ data, error: rpcErr }, { count, error: countErr }]) => {
      if (rpcErr || countErr) setError((rpcErr ?? countErr)!.message);
      else {
        setResults(data ?? []);
        setTotalClients(count ?? 0);
      }
      setIsLoading(false);
    });
  }, [tripId]);

  // Group results by category, preserving RPC ranking within each group
  const grouped = results.reduce<Record<string, SiteResult[]>>((acc, site) => {
    const cat = categoryOf(site);
    (acc[cat] ??= []).push(site);
    return acc;
  }, {});
  const categories = sortCategories(Object.keys(grouped));
  const hasGroups  = results.some(s => s.group_name);

  return (
    <>
      {/* Backdrop — above drawer (z-50) */}
      <div
        className="fixed inset-0 z-60 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Suggested dive sites"
        className="fixed inset-y-0 right-0 z-60 flex flex-col w-full sm:w-96 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Suggested Dive Sites</h2>
            {!isLoading && !error && (
              <p className="text-xs text-slate-400 mt-0.5">
                Ranked by how many clients haven't been there yet
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="p-5 text-sm text-rose-600">{error}</div>
          ) : results.length === 0 ? (
            <div className="p-5 text-sm text-slate-400 text-center pt-12">
              No dive sites found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {categories.map(cat => (
                <div key={cat}>
                  {/* Category header — only shown when org uses groups */}
                  {hasGroups && (
                    <div className="px-5 pt-4 pb-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                        {cat}
                      </span>
                    </div>
                  )}

                  {grouped[cat].map((site, idx) => {
                    const isTop    = idx === 0 && site.unseen_count > 0;
                    const allNew   = site.unseen_count === totalClients;
                    const noneNew  = site.unseen_count === 0;

                    return (
                      <div
                        key={site.id}
                        className={`flex items-center gap-3 px-5 py-3 ${isTop ? 'bg-teal-50/60' : ''}`}
                      >
                        {/* Rank */}
                        <span className="text-xs font-mono text-slate-300 w-5 shrink-0 text-right">
                          {idx + 1}
                        </span>

                        {/* Name + depth */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{site.name}</p>
                          <p className="text-xs text-slate-400">{formatDepth(site.max_depth, unitSystem)}</p>
                        </div>

                        {/* Unseen badge */}
                        <div className="shrink-0 text-right">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            allNew  ? 'bg-teal-100 text-teal-700' :
                            noneNew ? 'bg-slate-100 text-slate-400' :
                                      'bg-amber-50 text-amber-700'
                          }`}>
                            {site.unseen_count}/{totalClients} new
                          </span>
                          {site.total_past_visits > 0 && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {site.total_past_visits} past {site.total_past_visits === 1 ? 'visit' : 'visits'}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
