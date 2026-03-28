'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

import StaffTopBar from './components/StaffTopBar';
import StaffBoard  from './components/StaffBoard';
import StaffPanel  from './components/StaffPanel';
import TripDrawer  from '@/app/(dashboard)/components/TripDrawer';
import { getTodayStr, localHour } from './components/dateUtils';

export default function StaffPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [selectedDate,         setSelectedDate]         = useState(() => {
    if (typeof window === 'undefined') return getTodayStr();
    const params = new URLSearchParams(window.location.search);
    return params.get('date') ?? localStorage.getItem('diveflow_date') ?? getTodayStr();
  });
  const [trips,                setTrips]                = useState<any[]>([]);
  const [jobTypes,             setJobTypes]             = useState<any[]>([]);
  const [dailyJobs,            setDailyJobs]            = useState<any[]>([]);
  const [allStaff,             setAllStaff]             = useState<any[]>([]);
  const [selectedStaffIds,     setSelectedStaffIds]     = useState<string[]>([]);
  const [selectedTripIds,      setSelectedTripIds]      = useState<string[]>([]);
  const [selectedActivityKeys, setSelectedActivityKeys] = useState<{ tripId: string; activityId: string }[]>([]);
  const [selectedJobKeys,      setSelectedJobKeys]      = useState<{ jobTypeId: string; halfDay: 'AM' | 'PM' }[]>([]);
  const [isLoading,            setIsLoading]            = useState(false);
  const [userOrgId,            setUserOrgId]            = useState<string | null>(null);
  const [drawerTripId,         setDrawerTripId]         = useState<string | null>(null);

  // Keep a ref to allStaff so callbacks can access it without stale closure
  const allStaffRef = useRef<any[]>([]);
  useEffect(() => { allStaffRef.current = allStaff; }, [allStaff]);

  // Keep URL in sync and share date with other pages via localStorage
  useEffect(() => {
    router.replace(`?date=${selectedDate}`, { scroll: false });
    localStorage.setItem('diveflow_date', selectedDate);
  }, [selectedDate]);

  // Fetch organisation id once
  useEffect(() => {
    async function getOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single();
        if (profile) setUserOrgId(profile.organization_id);
      }
    }
    getOrg();
  }, [supabase]);

  // Fetch job types + staff list once per org (global types have organization_id = null)
  useEffect(() => {
    if (!userOrgId) return;
    async function fetchStaticData() {
      const [jobTypesRes, staffRes] = await Promise.all([
        supabase
          .from('job_types')
          .select('id, name, sort_order, organization_id')
          .or(`organization_id.eq.${userOrgId},organization_id.is.null`)
          .order('sort_order'),
        supabase
          .from('staff')
          .select('id, first_name, last_name, initials, captain_license')
          .eq('organization_id', userOrgId)
          .order('first_name'),
      ]);
      if (jobTypesRes.data) {
        // Deduplicate by name (case-insensitive), preferring org-specific over global.
        const byName = new Map<string, any>();
        for (const jt of jobTypesRes.data) {
          const key  = jt.name.toLowerCase();
          const prev = byName.get(key);
          if (!prev) {
            byName.set(key, jt);
          } else if (prev.organization_id === null && jt.organization_id !== null) {
            byName.set(key, jt);
          }
        }
        setJobTypes(
          Array.from(byName.values()).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        );
      }
      if (staffRes.data) setAllStaff(staffRes.data);
    }
    fetchStaticData();
  }, [userOrgId, supabase]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Returns 'AM' or 'PM' based on trip start_time string (HH:MM:SS) */
  function halfDayOf(startTime: string | null): 'AM' | 'PM' {
    return startTime && localHour(startTime) < 12 ? 'AM' : 'PM';
  }

  /** Looks up a job type ID by exact name (case-insensitive). */
  function jobTypeId(name: string, fallback?: string): string | undefined {
    return jobTypes.find(jt => jt.name.toLowerCase() === name.toLowerCase())?.id ?? fallback;
  }

  /**
   * After fetching staff_daily_job rows, insert "Unassigned" rows for any
   * staff member that has no row at all for a given half-day on selectedDate.
   * Returns true if any rows were inserted (caller should re-fetch).
   */
  async function generateMissingUnassigned(
    freshJobs: any[],
    orgId: string,
    date: string,
    staff: any[],
    unassignedId: string,
  ): Promise<boolean> {
    const covered = new Set(freshJobs.map(j => `${j.staff_id}_${j['AM/PM']}`));
    const toInsert = [];
    for (const s of staff) {
      for (const half of ['AM', 'PM'] as const) {
        if (!covered.has(`${s.id}_${half}`)) {
          toInsert.push({
            organization_id: orgId,
            staff_id: s.id,
            job_type_id: unassignedId,
            job_date: date,
            'AM/PM': half,
            trip_id: null,
          });
        }
      }
    }
    if (toInsert.length === 0) return false;
    await supabase.from('staff_daily_job').insert(toInsert);
    return true;
  }

  // ─── Data Fetching ────────────────────────────────────────────────────────

  const fetchDayData = useCallback(async () => {
    if (!userOrgId) return;
    setIsLoading(true);

    const [y, m, d] = selectedDate.split('-').map(Number);
    const dayStart  = new Date(y, m - 1, d,  0,  0,  0,   0);
    const dayEnd    = new Date(y, m - 1, d, 23, 59, 59, 999);

    const [tripsRes, jobsRes] = await Promise.all([
      supabase
        .from('trips')
        .select(`
          id, label, start_time, max_divers,
          trip_clients ( id, activity_id, activities ( id, name ) ),
          vessels      ( name, abbreviation ),
          trip_types   ( name, number_of_dives ),
          trip_staff   ( id, staff_id, activity_id, staff ( id, initials, first_name, last_name, captain_license ) )
        `)
        .eq('organization_id', userOrgId)
        .gte('start_time', dayStart.toISOString())
        .lte('start_time', dayEnd.toISOString())
        .order('start_time', { ascending: true }),

      supabase
        .from('staff_daily_job')
        .select(`*, staff ( id, initials, first_name, last_name )`)
        .eq('organization_id', userOrgId)
        .eq('job_date', selectedDate),
    ]);

    if (!tripsRes.error && tripsRes.data) {
      setTrips(tripsRes.data.map(t => {
        const activityMap = new Map<string, string>();
        for (const tc of t.trip_clients ?? []) {
          if (tc.activity_id && tc.activities) {
            activityMap.set(tc.activity_id, (tc.activities as any)?.name ?? '');
          }
        }
        return {
          ...t,
          booked_divers: t.trip_clients?.length ?? 0,
          activities: Array.from(activityMap.entries()).map(([id, name]) => ({ id, name })),
        };
      }));
    }

    let freshJobs = jobsRes.data ?? [];
    if (!jobsRes.error) {
      const today = new Date().toISOString().slice(0, 10);
      if (selectedDate < today) {
        const unassignedId = jobTypes.find(jt => jt.name === 'Unassigned')?.id;
        if (unassignedId && allStaffRef.current.length > 0) {
          const inserted = await generateMissingUnassigned(
            freshJobs, userOrgId, selectedDate, allStaffRef.current, unassignedId
          );
          if (inserted) {
            const { data } = await supabase
              .from('staff_daily_job')
              .select(`*, staff ( id, initials, first_name, last_name )`)
              .eq('organization_id', userOrgId)
              .eq('job_date', selectedDate);
            freshJobs = data ?? freshJobs;
          }
        }
      }
      setDailyJobs(freshJobs);
    }

    setIsLoading(false);
  }, [selectedDate, userOrgId, jobTypes, supabase]);

  useEffect(() => { fetchDayData(); }, [fetchDayData]);

  // ─── Target Selection Handlers ────────────────────────────────────────────

  const handleToggleTripSelection = useCallback((tripId: string) => {
    setSelectedTripIds(prev =>
      prev.includes(tripId) ? prev.filter(id => id !== tripId) : [...prev, tripId]
    );
  }, []);

  const handleToggleActivitySelection = useCallback((tripId: string, activityId: string) => {
    setSelectedActivityKeys(prev => {
      const exists = prev.some(k => k.tripId === tripId && k.activityId === activityId);
      return exists
        ? prev.filter(k => !(k.tripId === tripId && k.activityId === activityId))
        : [...prev, { tripId, activityId }];
    });
  }, []);

  const handleToggleJobSelection = useCallback((jtId: string, halfDay: 'AM' | 'PM') => {
    setSelectedJobKeys(prev => {
      const exists = prev.some(k => k.jobTypeId === jtId && k.halfDay === halfDay);
      return exists
        ? prev.filter(k => !(k.jobTypeId === jtId && k.halfDay === halfDay))
        : [...prev, { jobTypeId: jtId, halfDay }];
    });
  }, []);

  const handleCancelAssign = useCallback(() => {
    setSelectedStaffIds([]);
    setSelectedTripIds([]);
    setSelectedActivityKeys([]);
    setSelectedJobKeys([]);
  }, []);

  /** Applies all queued assignments across all selected targets, then exits assign mode. */
  const handleSaveAssignments = useCallback(async () => {
    if (!userOrgId || selectedStaffIds.length === 0) {
      handleCancelAssign();
      return;
    }

    const ops: PromiseLike<any>[] = [];
    const unassignedId = jobTypes.find(jt => jt.name === 'Unassigned')?.id;
    const crewId       = jobTypes.find(jt => jt.name === 'Crew')?.id;
    const captainId    = jobTypes.find(jt => jt.name === 'Captain')?.id;

    // ── Generic trip assignments ──────────────────────────────────────────
    for (const tripId of selectedTripIds) {
      const trip = trips.find(t => t.id === tripId);
      if (!trip) continue;

      const existingIds = new Set<string>(
        (trip.trip_staff ?? [])
          .filter((ts: any) => !ts.activity_id)
          .map((ts: any) => ts.staff_id)
      );
      const toAdd    = selectedStaffIds.filter(id => !existingIds.has(id));
      const toRemove = selectedStaffIds.filter(id =>  existingIds.has(id));
      const half     = halfDayOf(trip.start_time);
      const remainingIds = [...existingIds].filter(id => !toRemove.includes(id));
      const tripIsEmpty  = remainingIds.length === 0;

      if (toAdd.length > 0) {
        ops.push(supabase.from('trip_staff').insert(
          toAdd.map(staff_id => ({ trip_id: tripId, staff_id, role_id: null }))
        ));
        const sdjRows = toAdd.map((staff_id, index) => {
          let resolvedJobTypeId = crewId;
          if (tripIsEmpty && index === 0 && captainId) {
            const member = allStaff.find(s => s.id === staff_id);
            if (member?.captain_license) resolvedJobTypeId = captainId;
          }
          return {
            organization_id: userOrgId,
            staff_id,
            job_type_id: resolvedJobTypeId,
            job_date: selectedDate,
            'AM/PM': half,
            trip_id: tripId,
          };
        });
        ops.push(supabase.from('staff_daily_job').insert(sdjRows));
        if (unassignedId) {
          ops.push(supabase.from('staff_daily_job').delete()
            .in('staff_id', toAdd)
            .eq('job_type_id', unassignedId)
            .eq('job_date', selectedDate)
            .eq('AM/PM', half)
          );
        }
      }
      for (const staff_id of toRemove) {
        ops.push(supabase.from('trip_staff').delete()
          .eq('trip_id', tripId).eq('staff_id', staff_id));
        ops.push(supabase.from('staff_daily_job').delete()
          .eq('trip_id', tripId).eq('staff_id', staff_id).eq('job_date', selectedDate));
      }
    }

    // ── Activity assignments ──────────────────────────────────────────────
    for (const { tripId, activityId } of selectedActivityKeys) {
      const trip = trips.find(t => t.id === tripId);
      if (!trip) continue;

      const existing    = (trip.trip_staff ?? []).filter((ts: any) => ts.activity_id === activityId);
      const existingIds = new Set(existing.map((ts: any) => ts.staff_id));
      const toAdd       = selectedStaffIds.filter(id => !existingIds.has(id));
      const toRemove    = existing.filter((ts: any) => selectedStaffIds.includes(ts.staff_id));
      const half        = halfDayOf(trip.start_time);
      const actName     = trip.activities?.find((a: any) => a.id === activityId)?.name ?? '';
      const actJobId    = jobTypes.find(jt => jt.name.toLowerCase() === actName.toLowerCase())?.id
                        ?? jobTypes.find(jt => jt.name === 'Course')?.id
                        ?? crewId;

      if (toAdd.length > 0) {
        ops.push(supabase.from('trip_staff').insert(
          toAdd.map(staff_id => ({ trip_id: tripId, staff_id, activity_id: activityId, role_id: null }))
        ));
        for (const staff_id of toAdd) {
          ops.push(supabase.from('trip_clients')
            .update({ staff_assigned: staff_id })
            .eq('trip_id', tripId)
            .eq('activity_id', activityId)
            .is('staff_assigned', null)
          );
        }
        if (actJobId) {
          ops.push(supabase.from('staff_daily_job').insert(
            toAdd.map(staff_id => ({
              organization_id: userOrgId,
              staff_id,
              job_type_id: actJobId,
              job_date: selectedDate,
              'AM/PM': half,
              trip_id: tripId,
              activity_id: activityId,
            }))
          ));
          if (unassignedId) {
            ops.push(supabase.from('staff_daily_job').delete()
              .in('staff_id', toAdd)
              .eq('job_type_id', unassignedId)
              .eq('job_date', selectedDate)
              .eq('AM/PM', half)
            );
          }
        }
      }
      for (const ts of toRemove) {
        ops.push(supabase.from('trip_staff').delete().eq('id', ts.id));
        ops.push(supabase.from('trip_clients')
          .update({ staff_assigned: null })
          .eq('trip_id', tripId)
          .eq('activity_id', activityId)
          .eq('staff_assigned', ts.staff_id)
        );
        if (actJobId) {
          ops.push(supabase.from('staff_daily_job').delete()
            .eq('trip_id', tripId).eq('staff_id', ts.staff_id)
            .eq('job_type_id', actJobId).eq('job_date', selectedDate));
        }
      }
    }

    // ── Job card assignments ──────────────────────────────────────────────
    for (const { jobTypeId: jtId, halfDay } of selectedJobKeys) {
      const relevantJobs     = dailyJobs.filter(j => j.job_type_id === jtId && j['AM/PM'] === halfDay);
      const existingStaffIds = new Set(relevantJobs.map((j: any) => j.staff_id));
      const toAdd            = selectedStaffIds.filter(id => !existingStaffIds.has(id));
      const toRemove         = relevantJobs.filter((j: any) => selectedStaffIds.includes(j.staff_id));

      if (toAdd.length > 0) {
        ops.push(supabase.from('staff_daily_job').insert(
          toAdd.map(staff_id => ({
            organization_id: userOrgId,
            staff_id,
            job_type_id: jtId,
            job_date: selectedDate,
            'AM/PM': halfDay,
            trip_id: null,
          }))
        ));
        if (unassignedId) {
          ops.push(supabase.from('staff_daily_job').delete()
            .in('staff_id', toAdd)
            .eq('job_type_id', unassignedId)
            .eq('job_date', selectedDate)
            .eq('AM/PM', halfDay)
          );
        }
      }
      for (const job of toRemove) {
        ops.push(supabase.from('staff_daily_job').delete().eq('id', job.id));
      }
    }

    if (ops.length > 0) {
      await Promise.all(ops);
      await fetchDayData();
    }

    setSelectedStaffIds([]);
    setSelectedTripIds([]);
    setSelectedActivityKeys([]);
    setSelectedJobKeys([]);
  }, [
    userOrgId, selectedStaffIds, selectedTripIds, selectedActivityKeys, selectedJobKeys,
    trips, dailyJobs, selectedDate, jobTypes, allStaff, supabase, fetchDayData, handleCancelAssign,
  ]);

  // Enter = save, Escape = cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (selectedStaffIds.length === 0) return;
      if (e.key === 'Enter')  handleSaveAssignments();
      if (e.key === 'Escape') handleCancelAssign();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedStaffIds.length, handleSaveAssignments, handleCancelAssign]);

  // ─── Remove / Captain Handlers (unchanged) ────────────────────────────────

  /** Remove a staff member from a trip entirely (all trip_staff + all sdj rows for that trip). */
  const handleRemoveStaff = useCallback(async (tripId: string, staffId: string) => {
    await Promise.all([
      supabase.from('trip_staff').delete().eq('trip_id', tripId).eq('staff_id', staffId),
      supabase.from('staff_daily_job').delete()
        .eq('trip_id', tripId).eq('staff_id', staffId).eq('job_date', selectedDate),
    ]);
    await fetchDayData();
  }, [selectedDate, supabase, fetchDayData]);

  /**
   * Remove one activity-specific trip_staff row.
   * If the staff has no generic trip row, adds a generic one + a Crew sdj row
   * so they remain on the trip. Also removes the activity sdj row.
   */
  const handleRemoveActivityStaff = useCallback(async (
    tripStaffId: string,
    tripId: string,
    staffId: string,
  ) => {
    const trip      = trips.find(t => t.id === tripId);
    const tsRow     = (trip?.trip_staff ?? []).find((ts: any) => ts.id === tripStaffId);
    const actName   = trip?.activities?.find((a: any) => a.id === tsRow?.activity_id)?.name ?? '';
    const actJobId  = jobTypeId(actName) ?? jobTypeId('Course') ?? jobTypeId('Crew');
    const hasGeneric = (trip?.trip_staff ?? []).some(
      (ts: any) => ts.staff_id === staffId && !ts.activity_id
    );
    const half   = halfDayOf(trip?.start_time);
    const crewId = jobTypeId('Crew');

    const ops: PromiseLike<any>[] = [
      supabase.from('trip_staff').delete().eq('id', tripStaffId),
    ];
    if (actJobId) {
      ops.push(supabase.from('staff_daily_job').delete()
        .eq('trip_id', tripId).eq('staff_id', staffId)
        .eq('job_type_id', actJobId).eq('job_date', selectedDate));
    }
    if (!hasGeneric) {
      ops.push(supabase.from('trip_staff').insert(
        { trip_id: tripId, staff_id: staffId, role_id: null }
      ));
      if (crewId && userOrgId) {
        ops.push(supabase.from('staff_daily_job').insert({
          organization_id: userOrgId,
          staff_id: staffId,
          job_type_id: crewId,
          job_date: selectedDate,
          'AM/PM': half,
          trip_id: tripId,
        }));
      }
    }

    await Promise.all(ops);
    await fetchDayData();
  }, [userOrgId, trips, selectedDate, jobTypes, supabase, fetchDayData]);

  /**
   * Remove a staff chip from a job card.
   * Deletes ALL staff_daily_job rows for that staff+jobType+halfDay+date.
   * If any of those rows had a trip_id, also removes the generic trip_staff row.
   */
  const handleRemoveFromJob = useCallback(async (
    jobTypeId: string,
    staffId: string,
    halfDay: 'AM' | 'PM',
  ) => {
    const rows = dailyJobs.filter(
      j => j.job_type_id === jobTypeId && j.staff_id === staffId && j['AM/PM'] === halfDay
    );
    const ops: PromiseLike<any>[] = rows.map(j =>
      supabase.from('staff_daily_job').delete().eq('id', j.id)
    );
    for (const j of rows) {
      if (j.trip_id) {
        ops.push(supabase.from('trip_staff').delete()
          .eq('trip_id', j.trip_id).eq('staff_id', staffId).is('activity_id', null));
      }
    }
    await Promise.all(ops);
    await fetchDayData();
  }, [dailyJobs, supabase, fetchDayData]);

  /**
   * Promote a staff member to Captain on a specific trip.
   * Demotes any existing Captain on that trip back to Crew.
   */
  const handleAssignCaptain = useCallback(async (tripId: string, staffId: string) => {
    if (!userOrgId) return;
    const captainId = jobTypeId('Captain');
    const crewId    = jobTypeId('Crew');
    if (!captainId || !crewId) return;

    const genericRow = dailyJobs.find(
      j => j.staff_id === staffId && j.trip_id === tripId && !j.activity_id
    );

    const promoteOp = genericRow
      ? supabase.from('staff_daily_job')
          .update({ job_type_id: captainId })
          .eq('id', genericRow.id)
      : supabase.from('staff_daily_job')
          .insert({
            organization_id: userOrgId,
            staff_id: staffId,
            job_type_id: captainId,
            job_date: selectedDate,
            'AM/PM': halfDayOf(trips.find(t => t.id === tripId)?.start_time),
            trip_id: tripId,
            activity_id: null,
          });

    const demoteOp = supabase.from('staff_daily_job')
      .update({ job_type_id: crewId })
      .neq('staff_id', staffId)
      .eq('job_type_id', captainId)
      .eq('trip_id', tripId)
      .eq('job_date', selectedDate)
      .is('activity_id', null);

    await Promise.all([promoteOp, demoteOp]);
    await fetchDayData();
  }, [userOrgId, selectedDate, jobTypes, dailyJobs, trips, supabase, fetchDayData]);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const morningTrips   = trips.filter(t => localHour(t.start_time) < 12);
  const afternoonTrips = trips.filter(t => localHour(t.start_time) >= 12);
  const amJobs = dailyJobs.filter(j => j['AM/PM'] === 'AM');
  const pmJobs = dailyJobs.filter(j => j['AM/PM'] === 'PM');

  const unassignedStaffIds = useMemo(() => {
    const unassignedJobTypeId = jobTypes.find(jt => jt.name === 'Unassigned')?.id;
    const realJobs = dailyJobs.filter(j => j.job_type_id !== unassignedJobTypeId);
    const coveredAM = new Set(realJobs.filter(j => j['AM/PM'] === 'AM').map(j => j.staff_id));
    const coveredPM = new Set(realJobs.filter(j => j['AM/PM'] === 'PM').map(j => j.staff_id));
    return allStaff
      .filter(s => !coveredAM.has(s.id) || !coveredPM.has(s.id))
      .map(s => s.id);
  }, [dailyJobs, jobTypes, allStaff]);

  const totalSelectedTargets =
    selectedTripIds.length + selectedActivityKeys.length + selectedJobKeys.length;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      <StaffTopBar
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        totalTrips={trips.length}
        isLoading={isLoading}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <StaffBoard
          morningTrips={morningTrips}
          afternoonTrips={afternoonTrips}
          amJobs={amJobs}
          pmJobs={pmJobs}
          jobTypes={jobTypes}
          isLoading={isLoading}
          selectedDate={selectedDate}
          selectedStaffIds={selectedStaffIds}
          selectedTripIds={selectedTripIds}
          selectedActivityKeys={selectedActivityKeys}
          selectedJobKeys={selectedJobKeys}
          onToggleTripSelection={handleToggleTripSelection}
          onToggleActivitySelection={handleToggleActivitySelection}
          onToggleJobSelection={handleToggleJobSelection}
          onRemoveStaff={handleRemoveStaff}
          onRemoveFromJob={handleRemoveFromJob}
          onRemoveActivityStaff={handleRemoveActivityStaff}
          onAssignCaptain={handleAssignCaptain}
          onOpenTrip={setDrawerTripId}
        />
        <StaffPanel
          staff={allStaff}
          selectedIds={selectedStaffIds}
          unassignedIds={unassignedStaffIds}
          selectedTargetCount={totalSelectedTargets}
          onToggle={id => setSelectedStaffIds(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
          )}
          onCancel={handleCancelAssign}
          onSave={handleSaveAssignments}
        />
      </div>

      <TripDrawer
        isOpen={drawerTripId !== null}
        tripId={drawerTripId}
        onClose={() => setDrawerTripId(null)}
        onMovedToTrip={(trip) => setDrawerTripId(trip.id)}
      />
    </div>
  );
}
