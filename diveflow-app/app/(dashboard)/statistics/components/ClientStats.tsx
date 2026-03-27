'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { createClient } from '@/utils/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts';
import type { TimeRange } from './StaffStats';

// ─── Types ────────────────────────────────────────────────────────────────────

type RawTrip = {
  id: string;
  start_time: string;
  trip_types: { name: string; category: string | null } | null;
  trip_clients: RawBooking[];
};

type RawBooking = {
  id: string;
  client_id: string;
  activity_id: string | null;
  course_id: string | null;
  private: boolean;
  clients: { certification_levels: { name: string } | null } | null;
  activities: { name: string } | null;
  courses: { name: string } | null;
};

type RawActivity = {
  id: string;
  name: string;
  course: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fromDateFor(range: TimeRange): string | null {
  const today = new Date();
  if (range === '1m') { today.setDate(today.getDate() - 30); return today.toISOString().slice(0, 10); }
  if (range === '1y') { today.setFullYear(today.getFullYear() - 1); return today.toISOString().slice(0, 10); }
  return null;
}

function monthLabel(yyyymm: string) {
  const d = new Date(yyyymm + '-01T00:00:00');
  return d.toLocaleString('default', { month: 'short', year: '2-digit' });
}

function resolveActivity(
  booking: RawBooking,
  tripType: RawTrip['trip_types'],
  courseMap: Map<string, string>,
  activityCourseMap: Map<string, string | null>,
): string {
  if (booking.activity_id) {
    const courseId = activityCourseMap.get(booking.activity_id);
    if (courseId) {
      const courseName = courseMap.get(courseId);
      if (courseName) return courseName;
    }
    return booking.activities?.name ?? 'Unknown';
  }
  if (tripType?.category === 'Snorkel') return 'Snorkel';
  return 'Fan Dive';
}

const PALETTE = [
  '#14b8a6', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6',
  '#10b981', '#f97316', '#3b82f6', '#ec4899', '#84cc16',
];
function colorFor(_: string, i: number) { return PALETTE[i % PALETTE.length]; }

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchRefData() {
  const supabase = createClient();
  const [{ data: activities }, { data: courses }] = await Promise.all([
    supabase.from('activities').select('id, name, course'),
    supabase.from('courses').select('id, name'),
  ]);
  const courseMap        = new Map((courses ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const activityCourseMap = new Map((activities ?? []).map((a: RawActivity) => [a.id, a.course]));
  return { courseMap, activityCourseMap };
}

async function fetchClientStats([, orgId, timeRange]: [string, string, TimeRange]) {
  const supabase = createClient();
  let q = supabase
    .from('trips')
    .select(`
      id, start_time,
      trip_types(name, category),
      trip_clients(
        *,
        clients(certification_levels(name)),
        activities(name),
        courses(name)
      )
    `)
    .eq('organization_id', orgId)
    .order('start_time', { ascending: true });
  const from = fromDateFor(timeRange);
  if (from) q = q.gte('start_time', from + 'T00:00:00');
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as RawTrip[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-6 py-5 flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="text-3xl font-bold text-slate-800">{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

function DonutCard({ title, data, total }: {
  title: string;
  data: { name: string; count: number }[];
  total: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">{title}</h2>
      <div className="flex items-center gap-8">
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="name" cx="50%" cy="50%"
              innerRadius={55} outerRadius={88} paddingAngle={2}>
              {data.map((e, i) => <Cell key={e.name} fill={colorFor(e.name, i)} />)}
            </Pie>
            <Tooltip formatter={(v: any, _key: any, props: any) =>
              [`${v ?? 0} (${(((v ?? 0) / total) * 100).toFixed(1)}%)`, props?.payload?.name ?? '']
            } />
          </PieChart>
        </ResponsiveContainer>
        <ul className="flex flex-col gap-2 min-w-0">
          {data.map((e, i) => (
            <li key={e.name} className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorFor(e.name, i) }} />
              <span className="text-slate-700 truncate">{e.name}</span>
              <span className="ml-auto pl-3 font-medium text-slate-500 flex-shrink-0">
                {((e.count / total) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientStats({ orgId, timeRange }: { orgId: string; timeRange: TimeRange }) {
  const { data: refData } = useSWR('client-ref', fetchRefData);

  const { data: trips = [], isLoading } = useSWR(
    ['client-stats', orgId, timeRange],
    fetchClientStats
  );

  const courseMap         = refData?.courseMap         ?? new Map<string, string>();
  const activityCourseMap = refData?.activityCourseMap ?? new Map<string, string | null>();

  // ── Flatten all bookings (with trip context) ───────────────────────────────
  const bookings = useMemo(() =>
    trips.flatMap(t => t.trip_clients.map(b => ({ ...b, trip: t }))),
    [trips]
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  const totalBookings = bookings.length;

  const uniqueClients = useMemo(
    () => new Set(bookings.map(b => b.client_id)).size,
    [bookings]
  );

  const returningClients = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bookings) counts.set(b.client_id, (counts.get(b.client_id) ?? 0) + 1);
    return Array.from(counts.values()).filter(n => n > 1).length;
  }, [bookings]);

  const returningPct = uniqueClients > 0
    ? ((returningClients / uniqueClients) * 100).toFixed(1)
    : '—';

  const privateCount = useMemo(() => bookings.filter(b => b.private).length, [bookings]);
  const privatePct   = totalBookings > 0 ? ((privateCount / totalBookings) * 100).toFixed(1) : '—';

  // ── Activity breakdown ─────────────────────────────────────────────────────
  const activityData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of bookings) {
      const name = resolveActivity(b, b.trip.trip_types, courseMap, activityCourseMap);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [bookings, courseMap, activityCourseMap]);

  // ── Cert level breakdown ───────────────────────────────────────────────────
  const certData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of bookings) {
      const level = b.clients?.certification_levels?.name ?? 'Unknown';
      counts[level] = (counts[level] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [bookings]);

  // ── Course enrollments ─────────────────────────────────────────────────────
  const courseData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of bookings) {
      if (!b.courses?.name) continue;
      counts[b.courses.name] = (counts[b.courses.name] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [bookings]);

  // ── Monthly bookings ───────────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const months: Record<string, number> = {};
    for (const b of bookings) {
      const m = b.trip.start_time.slice(0, 7);
      months[m] = (months[m] ?? 0) + 1;
    }
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, count]) => ({ month: monthLabel(m), count }));
  }, [bookings]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) return <div className="text-sm text-slate-400 py-10 text-center">Loading…</div>;

  if (totalBookings === 0) return (
    <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center text-slate-400 text-sm">
      No client bookings found for this period
    </div>
  );

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total bookings"    value={totalBookings} />
        <StatCard label="Unique clients"    value={uniqueClients} />
        <StatCard label="Returning clients" value={`${returningPct}%`} sub={`${returningClients} of ${uniqueClients}`} />
        <StatCard label="Private bookings"  value={`${privatePct}%`} sub={`${privateCount} of ${totalBookings}`} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {activityData.length > 0 && (
          <DonutCard title="Bookings by activity" data={activityData} total={totalBookings} />
        )}
        {certData.length > 0 && (
          <DonutCard title="Bookings by cert level" data={certData} total={totalBookings} />
        )}
      </div>

      {monthlyData.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-6">Monthly bookings</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 16, left: -10, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="count" name="Bookings" fill="#14b8a6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {courseData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-6">Course enrollments</h2>
          <ResponsiveContainer width="100%" height={Math.max(180, courseData.length * 36)}>
            <BarChart data={courseData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={140} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="count" name="Enrollments" radius={[0, 4, 4, 0]}>
                {courseData.map((e, i) => <Cell key={e.name} fill={colorFor(e.name, i)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

    </div>
  );
}
