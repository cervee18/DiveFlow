'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { createClient } from '@/utils/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, Legend, PieChart, Pie,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

type StaffMember = { id: string; first_name: string; last_name: string };

type RawJob = {
  id: string;
  job_date: string;
  'AM/PM': string | null;
  trip_id: string | null;
  activity_id: string | null;
  job_types: { name: string; color: string | null } | null;
};

type DedupedJob = { dominant: RawJob; activityName: string | null };

export type TimeRange = '1m' | '1y' | 'all';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fromDateFor(range: TimeRange): string | null {
  const today = new Date();
  if (range === '1m') { today.setDate(today.getDate() - 30); return today.toISOString().slice(0, 10); }
  if (range === '1y') { today.setFullYear(today.getFullYear() - 1); return today.toISOString().slice(0, 10); }
  return null;
}

function monthLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleString('default', { month: 'short', year: '2-digit' });
}

const PALETTE = [
  '#14b8a6', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6',
  '#10b981', '#f97316', '#3b82f6', '#ec4899', '#84cc16',
];
function colorFor(_name: string, index: number) {
  return PALETTE[index % PALETTE.length];
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchBootstrap([, orgId]: [string, string]) {
  const supabase = createClient();
  const [{ data: staff }, { data: activities }] = await Promise.all([
    supabase.from('staff').select('id, first_name, last_name')
      .eq('organization_id', orgId).order('first_name', { ascending: true }),
    supabase.from('activities').select('id, name'),
  ]);
  const activityMap: Record<string, string> = {};
  for (const a of activities ?? []) activityMap[a.id] = a.name;
  return { staffList: (staff ?? []) as StaffMember[], activityMap };
}

async function fetchJobs([, orgId, timeRange, staffId]: [string, string, TimeRange, string]) {
  const supabase = createClient();
  let q = supabase
    .from('staff_daily_job')
    .select('*, job_types(name, color)')
    .eq('staff_id', staffId)
    .eq('organization_id', orgId)
    .order('job_date', { ascending: true });
  const from = fromDateFor(timeRange);
  if (from) q = q.gte('job_date', from);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as RawJob[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-6 py-5 flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="text-3xl font-bold text-slate-800">{value}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StaffStats({ orgId, timeRange }: { orgId: string; timeRange: TimeRange }) {
  const [selectedStaff, setSelectedStaff] = useState<string>('');

  const { data: bootstrap } = useSWR(
    ['staff-bootstrap', orgId],
    fetchBootstrap
  );

  const { data: jobs = [], isLoading } = useSWR(
    selectedStaff ? ['staff-jobs', orgId, timeRange, selectedStaff] : null,
    fetchJobs
  );

  const staffList  = bootstrap?.staffList  ?? [];
  const activityMap = bootstrap?.activityMap ?? {};

  // ── Derived stats ──────────────────────────────────────────────────────────
  const activeJobs = useMemo(
    () => jobs.filter(j => j.job_types?.name !== 'Unassigned'),
    [jobs]
  );

  const dedupedJobs = useMemo<DedupedJob[]>(() => {
    const priority = (name: string) => name === 'Captain' ? 2 : name === 'Crew' ? 1 : 0;
    const groups = new Map<string, RawJob[]>();
    for (const j of activeJobs) {
      const key = j.trip_id
        ? `${j.trip_id}:${j.job_date}:${j['AM/PM'] ?? ''}`
        : `__solo__${j.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(j);
    }
    return Array.from(groups.values()).map(rows => {
      const dominant = rows.reduce((best, j) =>
        priority(j.job_types?.name ?? '') > priority(best.job_types?.name ?? '') ? j : best
      );
      const actRow = rows.find(r => r.activity_id && r !== dominant);
      return { dominant, activityName: actRow ? (activityMap[actRow.activity_id!] ?? 'Unknown') : null };
    });
  }, [activeJobs, activityMap]);

  const daysWorked = useMemo(() => new Set(dedupedJobs.map(d => d.dominant.job_date)).size, [dedupedJobs]);
  const halfDays   = dedupedJobs.length;
  const tripCount  = useMemo(
    () => new Set(dedupedJobs.filter(d => d.dominant.trip_id).map(d => d.dominant.trip_id)).size,
    [dedupedJobs]
  );

  const { jobTypeData, activityBreakdown } = useMemo(() => {
    const counts: Record<string, number> = {};
    const breakdown: Record<string, Record<string, number>> = {};
    for (const { dominant, activityName } of dedupedJobs) {
      const type = dominant.job_types?.name ?? 'Unknown';
      counts[type] = (counts[type] ?? 0) + 1;
      if (activityName && (type === 'Crew' || type === 'Captain')) {
        if (!breakdown[type]) breakdown[type] = {};
        breakdown[type][activityName] = (breakdown[type][activityName] ?? 0) + 1;
      }
    }
    return {
      jobTypeData: Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      activityBreakdown: breakdown,
    };
  }, [dedupedJobs]);

  const { monthlyData, jobTypeNames } = useMemo(() => {
    const months: Record<string, Record<string, number>> = {};
    const typeSet = new Set<string>();
    for (const { dominant } of dedupedJobs) {
      const month = dominant.job_date.slice(0, 7);
      const type  = dominant.job_types?.name ?? 'Unknown';
      if (!months[month]) months[month] = {};
      months[month][type] = (months[month][type] ?? 0) + 1;
      typeSet.add(type);
    }
    const jobTypeNames = Array.from(typeSet);
    const monthlyData = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, byType]) => ({ month: monthLabel(month + '-01'), ...byType }));
    return { monthlyData, jobTypeNames };
  }, [dedupedJobs]);

  const selectedStaffName = useMemo(() => {
    const s = staffList.find(s => s.id === selectedStaff);
    return s ? `${s.first_name} ${s.last_name}` : '';
  }, [staffList, selectedStaff]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Staff selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Staff member</label>
        <select
          value={selectedStaff}
          onChange={e => setSelectedStaff(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[220px] w-fit"
        >
          <option value="">Select staff…</option>
          {staffList.map(s => (
            <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
          ))}
        </select>
      </div>

      {!selectedStaff && (
        <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center text-slate-400 text-sm">
          Select a staff member to view statistics
        </div>
      )}

      {selectedStaff && isLoading && (
        <div className="text-sm text-slate-400 py-10 text-center">Loading…</div>
      )}

      {selectedStaff && !isLoading && (
        <div className="space-y-6">

          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Days worked" value={daysWorked} />
            <StatCard label="Half-days"   value={halfDays} />
            <StatCard label="Trips"       value={tripCount} />
          </div>

          {jobTypeData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Half-days by job type</h2>
              <div className="flex items-center gap-8">
                <ResponsiveContainer width={220} height={220}>
                  <PieChart>
                    <Pie data={jobTypeData} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2}>
                      {jobTypeData.map((entry, i) => <Cell key={entry.name} fill={colorFor(entry.name, i)} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${value} (${((value / halfDays) * 100).toFixed(1)}%)`, 'Half-days']} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex flex-col gap-2">
                  {jobTypeData.map((entry, i) => {
                    const subActivities = activityBreakdown[entry.name];
                    return (
                      <li key={entry.name}>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorFor(entry.name, i) }} />
                          <span className="text-slate-700">{entry.name}</span>
                          <span className="ml-auto pl-4 font-medium text-slate-500">{((entry.count / halfDays) * 100).toFixed(1)}%</span>
                        </div>
                        {subActivities && (
                          <ul className="ml-5 mt-1 flex flex-col gap-0.5">
                            {Object.entries(subActivities).sort(([, a], [, b]) => b - a).map(([actName, count]) => (
                              <li key={actName} className="flex items-center gap-1.5 text-xs text-slate-400">
                                <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />
                                <span>{actName}</span>
                                <span className="ml-auto pl-3">{count}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {monthlyData.length > 1 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-6">Monthly trend</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyData} margin={{ top: 0, right: 16, left: -10, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {jobTypeNames.map((type, i) => (
                    <Bar key={type} dataKey={type} stackId="a" fill={colorFor(type, i)} radius={i === jobTypeNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeJobs.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-slate-400 text-sm">
              No data for {selectedStaffName} in this period
            </div>
          )}

        </div>
      )}
    </div>
  );
}
