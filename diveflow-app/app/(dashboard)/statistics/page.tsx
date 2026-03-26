'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import StaffStats, { type TimeRange } from './components/StaffStats';
import BoatStats from './components/BoatStats';
import ClientStats from './components/ClientStats';

// ─── Module definitions ───────────────────────────────────────────────────────

type ModuleId = 'staff' | 'boat' | 'clients';

const MODULES: { id: ModuleId; label: string }[] = [
  { id: 'staff',   label: 'Staff' },
  { id: 'boat',    label: 'Boat' },
  { id: 'clients', label: 'Clients' },
];

// ─── Placeholder ─────────────────────────────────────────────────────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 py-24 text-center text-slate-400 text-sm">
      {label} statistics — coming soon
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatisticsPage() {
  const supabase = createClient();

  const [orgId,     setOrgId]     = useState<string | null>(null);
  const [module,    setModule]    = useState<ModuleId>('staff');
  const [timeRange, setTimeRange] = useState<TimeRange>('1m');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single();
      if (profile) setOrgId(profile.organization_id);
    }
    init();
  }, [supabase]);

  return (
    <div className="flex min-h-screen">

      {/* Module sidebar */}
      <aside className="w-44 border-r border-slate-200 bg-white flex flex-col pt-8 px-3 gap-1 flex-shrink-0">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">Modules</p>
        {MODULES.map(m => (
          <button
            key={m.id}
            onClick={() => setModule(m.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              module === m.id
                ? 'bg-teal-50 text-teal-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            {m.label}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 p-8 max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {MODULES.find(m => m.id === module)?.label} Statistics
            </h1>
          </div>

          {/* Time range — shared across all modules */}
          <div className="flex flex-col items-end gap-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Period</label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {([['1m', 'Last month'], ['1y', 'Last year'], ['all', 'All time']] as [TimeRange, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTimeRange(val)}
                  className={`px-4 h-9 text-sm font-medium transition-colors ${
                    timeRange === val
                      ? 'bg-teal-500 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Module content */}
        {!orgId ? (
          <div className="text-sm text-slate-400 py-10 text-center">Loading…</div>
        ) : (
          <>
            {module === 'staff'   && <StaffStats orgId={orgId} timeRange={timeRange} />}
            {module === 'boat'    && <BoatStats orgId={orgId} timeRange={timeRange} />}
            {module === 'clients' && <ClientStats orgId={orgId} timeRange={timeRange} />}
          </>
        )}

      </div>
    </div>
  );
}
