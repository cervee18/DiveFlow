'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import TripDrawer from '@/app/(dashboard)/components/TripDrawer';

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertType = 'missing_waiver' | 'missing_deposit' | 'no_staff';
type Severity  = 'critical' | 'warning';
type Category  = 'all' | 'staff' | 'clients';

interface UnassignedMember {
  id:         string;
  first_name: string;
  last_name:  string;
}

interface Alert {
  alert_type:  AlertType;
  severity:    Severity;
  trip_id:     string;
  trip_start:  string;
  trip_label:  string;
  client_id:   string | null;
  client_name: string | null;
  message:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALERT_LABELS: Record<AlertType, string> = {
  missing_waiver:  'Missing Waiver',
  missing_deposit: 'Missing Deposit',
  no_staff:        'No Staff',
};

const STAFF_ALERT_TYPES:  AlertType[] = ['no_staff'];
const CLIENT_ALERT_TYPES: AlertType[] = ['missing_waiver', 'missing_deposit'];

function alertKey(a: Alert): string {
  return `${a.alert_type}:${a.trip_id}:${a.client_id ?? ''}`;
}

/** Returns YYYY-MM-DD in local time for a given Date (or today if omitted). */
function toLocalDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTripDate(iso: string): string {
  const d = new Date(iso);
  const today    = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();

  if (sameDay(d, today))    return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (sameDay(d, tomorrow)) return `Tomorrow ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        Critical
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
      Warning
    </span>
  );
}

interface AlertRowProps {
  alert:      Alert;
  onDismiss:  (alert: Alert) => void;
  dismissing: boolean;
  onClick:    (alert: Alert) => void;
}

function AlertRow({ alert, onDismiss, dismissing, onClick }: AlertRowProps) {
  return (
    <div
      onClick={() => onClick(alert)}
      className={`flex items-center justify-between gap-3 py-1.5 px-3 rounded-lg border cursor-pointer transition-opacity hover:opacity-80 ${
        alert.severity === 'critical'
          ? 'bg-red-50 border-red-100'
          : 'bg-amber-50 border-amber-100'
      }`}
    >
      <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
        <SeverityBadge severity={alert.severity} />
        <span className="text-xs font-medium text-slate-500 shrink-0">
          {ALERT_LABELS[alert.alert_type]}
        </span>
        <span className="text-xs font-medium text-slate-800 truncate">
          {alert.message}
        </span>
        <span className="text-xs text-slate-400 shrink-0">
          {alert.trip_label} · {formatTripDate(alert.trip_start)}
        </span>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onDismiss(alert); }}
        disabled={dismissing}
        title="Dismiss alert"
        className="shrink-0 mt-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors p-1 rounded hover:bg-white/60"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AlertsPanel() {
  const supabase = createClient();
  const router   = useRouter();

  const [orgId,             setOrgId]             = useState<string | null>(null);
  const [alerts,            setAlerts]            = useState<Alert[]>([]);
  const [isLoading,         setIsLoading]         = useState(true);
  const [dismissing,        setDismissing]        = useState<Set<string>>(new Set());
  const [drawerTripId,      setDrawerTripId]      = useState<string | null>(null);
  const [unassignedToday,   setUnassignedToday]   = useState<UnassignedMember[]>([]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [category,    setCategory]    = useState<Category>('all');
  /** YYYY-MM-DD local string, or null = no date filter */
  const [dateFilter,  setDateFilter]  = useState<string | null>(null);

  // ── Fetch org id once ─────────────────────────────────────────────────────
  useEffect(() => {
    async function getOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();
      if (data) setOrgId(data.organization_id);
    }
    getOrg();
  }, [supabase]);

  // ── Fetch alerts ──────────────────────────────────────────────────────────
  const loadAlerts = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .rpc('get_active_alerts', { p_org_id: orgId });
    if (!error && data) setAlerts(data as Alert[]);
    else if (error) console.error('[AlertsPanel] fetch error:', error.message);
    setIsLoading(false);
  }, [orgId, supabase]);

  useEffect(() => { loadAlerts(); }, [loadAlerts]);

  // ── Unassigned staff today ─────────────────────────────────────────────────
  const loadUnassignedStaff = useCallback(async () => {
    if (!orgId) return;
    const today = toLocalDateStr();
    const [staffRes, jobTypesRes, todayJobsRes] = await Promise.all([
      supabase.from('staff').select('id, first_name, last_name').eq('organization_id', orgId),
      supabase.from('job_types').select('id, name').or(`organization_id.eq.${orgId},organization_id.is.null`),
      supabase.from('staff_daily_job').select('staff_id, job_type_id').eq('organization_id', orgId).eq('job_date', today),
    ]);
    if (!staffRes.data) return;
    const unassignedId = jobTypesRes.data?.find((jt: any) => jt.name === 'Unassigned')?.id;
    const staffWithRealJobs = new Set(
      (todayJobsRes.data ?? []).filter((j: any) => j.job_type_id !== unassignedId).map((j: any) => j.staff_id)
    );
    setUnassignedToday(staffRes.data.filter((s: any) => !staffWithRealJobs.has(s.id)));
  }, [orgId, supabase]);

  useEffect(() => { loadUnassignedStaff(); }, [loadUnassignedStaff]);

  // ── Dismiss ───────────────────────────────────────────────────────────────
  const handleDismiss = async (alert: Alert) => {
    if (!orgId) return;
    const key = alertKey(alert);
    setDismissing(prev => new Set(prev).add(key));

    const { error } = await supabase.from('alert_resolutions').insert({
      org_id:     orgId,
      alert_type: alert.alert_type,
      trip_id:    alert.trip_id,
      client_id:  alert.client_id ?? null,
      // resolved_by: null until staff.profile_id is linked to auth
    });

    if (error) {
      console.error('[AlertsPanel] dismiss error:', error.message);
    } else {
      setAlerts(prev => prev.filter(a => alertKey(a) !== key));
    }

    setDismissing(prev => { const s = new Set(prev); s.delete(key); return s; });
  };

  // ── Click handler ────────────────────────────────────────────────────────
  const handleAlertClick = useCallback((alert: Alert) => {
    if (STAFF_ALERT_TYPES.includes(alert.alert_type)) {
      router.push(`/staff?date=${toLocalDateStr(new Date(alert.trip_start))}`);
    } else {
      setDrawerTripId(alert.trip_id);
    }
  }, [router]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return alerts.filter(a => {
      if (category === 'staff'   && !STAFF_ALERT_TYPES.includes(a.alert_type))  return false;
      if (category === 'clients' && !CLIENT_ALERT_TYPES.includes(a.alert_type)) return false;
      if (dateFilter) {
        const tripDateStr = toLocalDateStr(new Date(a.trip_start));
        if (tripDateStr !== dateFilter) return false;
      }
      return true;
    });
  }, [alerts, category, dateFilter]);

  // ── Render ────────────────────────────────────────────────────────────────
  const totalAll       = alerts.length;
  const criticalAll    = alerts.filter(a => a.severity === 'critical').length;
  const visibleCrit    = filtered.filter(a => a.severity === 'critical');
  const visibleWarn    = filtered.filter(a => a.severity === 'warning');

  const categoryTabs: { key: Category; label: string }[] = [
    { key: 'all',     label: 'All' },
    { key: 'clients', label: 'Clients' },
    { key: 'staff',   label: 'Staff' },
  ];

  return (
    <>
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Alerts</h2>
          {totalAll > 0 && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              criticalAll > 0 ? 'bg-red-500 text-white' : 'bg-amber-400 text-white'
            }`}>
              {totalAll}
            </span>
          )}
        </div>
        <button
          onClick={() => { loadAlerts(); loadUnassignedStaff(); }}
          title="Refresh alerts"
          className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded hover:bg-slate-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 flex-wrap">
        {/* Category tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          {categoryTabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                category === key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-1.5 ml-auto">
          <input
            type="date"
            value={dateFilter ?? ''}
            onChange={e => setDateFilter(e.target.value || null)}
            className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter(null)}
              title="Clear date filter"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="p-4">

        {/* Unassigned staff today — shown in All + Staff tabs */}
        {!isLoading && unassignedToday.length > 0 && (category === 'all' || category === 'staff') && (
          <div
            onClick={() => router.push(`/staff?date=${toLocalDateStr()}`)}
            className="flex items-center gap-3 py-1.5 px-3 mb-3 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors"
          >
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              Warning
            </span>
            <span className="text-xs font-medium text-slate-500 shrink-0">Unassigned Today</span>
            <span className="text-xs font-medium text-slate-800 truncate">
              {unassignedToday.length === 1
                ? `${unassignedToday[0].first_name} ${unassignedToday[0].last_name} has no job assigned`
                : `${unassignedToday.map(s => s.first_name).slice(0, 3).join(', ')}${unassignedToday.length > 3 ? ` +${unassignedToday.length - 3} more` : ''} — ${unassignedToday.length} staff unassigned`
              }
            </span>
            <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2].map(i => (
              <div key={i} className="h-16 bg-slate-100 rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 && unassignedToday.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <svg className="w-8 h-8 text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-slate-400">
              {totalAll === 0 ? 'No active alerts' : 'No alerts match the current filters'}
            </p>
          </div>
        ) : filtered.length === 0 ? null : (
          <div className="space-y-1">
            {[...visibleCrit, ...visibleWarn].map(alert => (
              <AlertRow
                key={alertKey(alert)}
                alert={alert}
                onDismiss={handleDismiss}
                dismissing={dismissing.has(alertKey(alert))}
                onClick={handleAlertClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>

    <TripDrawer
      isOpen={drawerTripId !== null}
      tripId={drawerTripId}
      onClose={() => { setDrawerTripId(null); loadAlerts(); }}
      onSuccess={loadAlerts}
    />
    </>
  );
}
