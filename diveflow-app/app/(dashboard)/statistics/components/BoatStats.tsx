'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, LineChart, Line, CartesianGrid,
} from 'recharts';
import type { TimeRange } from './StaffStats';

// ─── Types ────────────────────────────────────────────────────────────────────

type Vessel = { id: string; name: string; capacity: number };

type RawTrip = {
  id: string;
  start_time: string;
  max_divers: number;
  trip_types: { name: string } | null;
  trip_clients: { id: string }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fromDateFor(range: TimeRange): string | null {
  const today = new Date();
  if (range === '1m') { today.setDate(today.getDate() - 30); return today.toISOString().slice(0, 10); }
  if (range === '1y') { today.setFullYear(today.getFullYear() - 1); return today.toISOString().slice(0, 10); }
  return null;
}

function monthKey(isoString: string) {
  return isoString.slice(0, 7); // YYYY-MM
}

function monthLabel(yyyymm: string) {
  const d = new Date(yyyymm + '-01T00:00:00');
  return d.toLocaleString('default', { month: 'short', year: '2-digit' });
}

const PALETTE = [
  '#14b8a6', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6',
  '#10b981', '#f97316', '#3b82f6', '#ec4899', '#84cc16',
];
function colorFor(_name: string, index: number) { return PALETTE[index % PALETTE.length]; }

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-6 py-5 flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="text-3xl font-bold text-slate-800">{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BoatStats({ orgId, timeRange }: { orgId: string; timeRange: TimeRange }) {
  const supabase = createClient();

  const [vessels,        setVessels]        = useState<Vessel[]>([]);
  const [selectedVessel, setSelectedVessel] = useState<string>('');
  const [trips,          setTrips]          = useState<RawTrip[]>([]);
  const [loading,        setLoading]        = useState(false);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('vessels')
      .select('id, name, capacity')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
      .then(({ data }) => { if (data) setVessels(data); });
  }, [orgId, supabase]);

  // ── Fetch trips ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedVessel) { setTrips([]); return; }
    async function load() {
      setLoading(true);
      let q = supabase
        .from('trips')
        .select('id, start_time, max_divers, trip_types(name), trip_clients(id)')
        .eq('vessel_id', selectedVessel)
        .eq('organization_id', orgId)
        .order('start_time', { ascending: true });
      const from = fromDateFor(timeRange);
      if (from) q = q.gte('start_time', from + 'T00:00:00');
      const { data, error } = await q;
      if (error) console.error('BoatStats fetch error:', error);
      setTrips((data as RawTrip[]) ?? []);
      setLoading(false);
    }
    load();
  }, [orgId, selectedVessel, timeRange, supabase]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalTrips   = trips.length;
  const totalClients = useMemo(() => trips.reduce((s, t) => s + t.trip_clients.length, 0), [trips]);
  const totalCapacity = useMemo(() => trips.reduce((s, t) => s + t.max_divers, 0), [trips]);

  const avgOccupancy = totalCapacity > 0
    ? ((totalClients / totalCapacity) * 100).toFixed(1)
    : '—';

  const avgClientsPerTrip = totalTrips > 0
    ? (totalClients / totalTrips).toFixed(1)
    : '—';

  // Trips by type — for donut
  const tripTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of trips) {
      const name = t.trip_types?.name ?? 'Unknown';
      counts[name] = (counts[name] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [trips]);

  // Monthly data — trips count + occupancy %
  const { monthlyTrips, monthlyOccupancy, tripTypeNames } = useMemo(() => {
    const tripsPerMonth: Record<string, Record<string, number>> = {};
    const capacityPerMonth: Record<string, number> = {};
    const clientsPerMonth: Record<string, number>  = {};
    const typeSet = new Set<string>();

    for (const t of trips) {
      const m    = monthKey(t.start_time);
      const type = t.trip_types?.name ?? 'Unknown';
      typeSet.add(type);
      if (!tripsPerMonth[m]) tripsPerMonth[m] = {};
      tripsPerMonth[m][type] = (tripsPerMonth[m][type] ?? 0) + 1;
      capacityPerMonth[m] = (capacityPerMonth[m] ?? 0) + t.max_divers;
      clientsPerMonth[m]  = (clientsPerMonth[m]  ?? 0) + t.trip_clients.length;
    }

    const sortedMonths = Object.keys(tripsPerMonth).sort();
    const tripTypeNames = Array.from(typeSet);

    const monthlyTrips = sortedMonths.map(m => ({
      month: monthLabel(m),
      ...tripsPerMonth[m],
    }));

    const monthlyOccupancy = sortedMonths.map(m => ({
      month: monthLabel(m),
      occupancy: capacityPerMonth[m] > 0
        ? parseFloat(((clientsPerMonth[m] / capacityPerMonth[m]) * 100).toFixed(1))
        : 0,
    }));

    return { monthlyTrips, monthlyOccupancy, tripTypeNames };
  }, [trips]);

  const selectedVesselName = vessels.find(v => v.id === selectedVessel)?.name ?? '';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Vessel selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Vessel</label>
        <select
          value={selectedVessel}
          onChange={e => setSelectedVessel(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[220px] w-fit"
        >
          <option value="">Select vessel…</option>
          {vessels.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>

      {!selectedVessel && (
        <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center text-slate-400 text-sm">
          Select a vessel to view statistics
        </div>
      )}

      {selectedVessel && loading && (
        <div className="text-sm text-slate-400 py-10 text-center">Loading…</div>
      )}

      {selectedVessel && !loading && (
        <div className="space-y-6">

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Trips"              value={totalTrips} />
            <StatCard label="Total clients"      value={totalClients} />
            <StatCard label="Avg occupancy"      value={`${avgOccupancy}%`} sub={`${totalClients} / ${totalCapacity} slots`} />
            <StatCard label="Avg clients / trip" value={avgClientsPerTrip} />
          </div>

          {/* Trips by type — donut */}
          {tripTypeData.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Trips by type</h2>
              <div className="flex items-center gap-8">
                <ResponsiveContainer width={220} height={220}>
                  <PieChart>
                    <Pie
                      data={tripTypeData}
                      dataKey="count"
                      nameKey="name"
                      cx="50%" cy="50%"
                      innerRadius={60} outerRadius={95}
                      paddingAngle={2}
                    >
                      {tripTypeData.map((entry, i) => <Cell key={entry.name} fill={colorFor(entry.name, i)} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${value} (${((value / totalTrips) * 100).toFixed(1)}%)`, 'Trips']} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex flex-col gap-2">
                  {tripTypeData.map((entry, i) => (
                    <li key={entry.name} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorFor(entry.name, i) }} />
                      <span className="text-slate-700">{entry.name}</span>
                      <span className="ml-auto pl-4 font-medium text-slate-500">{((entry.count / totalTrips) * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Monthly trips + occupancy */}
          {monthlyTrips.length > 1 && (
            <div className="grid grid-cols-2 gap-6">

              {/* Monthly trips stacked by type */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-sm font-semibold text-slate-700 mb-6">Monthly trips</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyTrips} margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {tripTypeNames.map((type, i) => (
                      <Bar key={type} dataKey={type} stackId="a" fill={colorFor(type, i)}
                        radius={i === tripTypeNames.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly occupancy % */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-sm font-semibold text-slate-700 mb-6">Monthly occupancy %</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyOccupancy} margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v}%`, 'Occupancy']} />
                    <Line type="monotone" dataKey="occupancy" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

            </div>
          )}

          {totalTrips === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-slate-400 text-sm">
              No trips found for {selectedVesselName} in this period
            </div>
          )}

        </div>
      )}
    </div>
  );
}
