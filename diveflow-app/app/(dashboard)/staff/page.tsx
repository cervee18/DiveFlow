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

  const [selectedDate,     setSelectedDate]     = useState(() => {
    if (typeof window === 'undefined') return getTodayStr();
    const params = new URLSearchParams(window.location.search);
    return params.get('date') ?? localStorage.getItem('diveflow_date') ?? getTodayStr();
  });
  const [trips,            setTrips]            = useState<any[]>([]);
  const [jobTypes,         setJobTypes]         = useState<any[]>([]);
  const [dailyJobs,        setDailyJobs]        = useState<any[]>([]);
  const [allStaff,         setAllStaff]         = useState<any[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [isLoading,        setIsLoading]        = useState(false);
  const [userOrgId,        setUserOrgId]        = useState<string | null>(null);
  const [drawerTripId,     setDrawerTripId]     = useState<string | null>(null);

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
          .select('id, name, sort_order')
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
        // Handles three cases:
        //   1. Two org-specific rows with the same name → keep the first
        //   2. Org-specific + global with same name → keep org-specific
        //   3. Org-specific "Holiday" + global "Holidays" → both kept (different names)
        const byName = new Map<string, any>();
        for (const jt of jobTypesRes.data) {
          const key  = jt.name.toLowerCase();
          const prev = byName.get(key);
          if (!prev) {
            byName.set(key, jt);
          } else if (prev.organization_id === null && jt.organization_id !== null) {
            // Replace global with org-specific
            byName.set(key, jt);
          }
          // If both are org-specific or both are global, keep the first one
        }
        setJobTypes(
          Array.from(byName.values()).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        );
      }
      if (staffRes.data)    setAllStaff(staffRes.data);
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
            activityMap.set(tc.activity_id, tc.activities.name);
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
      // Only backfill Unassigned rows for days that have already passed —
      // future/today dates accumulate assignments naturally without placeholders.
      const today = new Date().toISOString().slice(0, 10);
      if (selectedDate < today) {
        const unassignedId = jobTypes.find(jt => jt.name === 'Unassigned')?.id;
        if (unassignedId && allStaffRef.current.length > 0) {
          const inserted = await generateMissingUnassigned(
            freshJobs, userOrgId, selectedDate, allStaffRef.current, unassignedId
          );
          if (inserted) {
            // Re-fetch to include the newly inserted rows
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

  // ─── Assignment Handlers ──────────────────────────────────────────────────

  /** Generic trip assignment — also syncs a Crew row to staff_daily_job. */
  const handleTripAssign = useCallback(async (tripId: string) => {
    if (!userOrgId || selectedStaffIds.length === 0) return;

    const trip = trips.find(t => t.id === tripId);
    const existingIds = new Set(
      (trip?.trip_staff ?? [])
        .filter((ts: any) => !ts.activity_id)
        .map((ts: any) => ts.staff_id)
    );

    const toAdd    = selectedStaffIds.filter(id => !existingIds.has(id));
    const toRemove = selectedStaffIds.filter(id =>  existingIds.has(id));
    const half      = halfDayOf(trip?.start_time);
    const crewId    = jobTypeId('Crew');
    const captainId = jobTypeId('Captain');

    // Trip is "effectively empty" if no generic staff will remain after this operation's removals.
    // Handles the case where the only existing member is being swapped out in the same click.
    const remainingIds = [...existingIds].filter(id => !toRemove.includes(id));
    const tripIsEmpty  = remainingIds.length === 0;

    const ops: Promise<any>[] = [];

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
      // Replace the Unassigned row for this half-day
      const unassignedId = jobTypeId('Unassigned');
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

    await Promise.all(ops);
    setSelectedStaffIds([]);
    await fetchDayData();
  }, [userOrgId, selectedStaffIds, trips, selectedDate, jobTypes, allStaff, supabase, fetchDayData]);

  /** Remove a staff member from a trip entirely (all trip_staff + all sdj rows for that trip). */
  const handleRemoveStaff = useCallback(async (tripId: string, staffId: string) => {
    await Promise.all([
      supabase.from('trip_staff').delete().eq('trip_id', tripId).eq('staff_id', staffId),
      supabase.from('staff_daily_job').delete()
        .eq('trip_id', tripId).eq('staff_id', staffId).eq('job_date', selectedDate),
    ]);
    await fetchDayData();
  }, [selectedDate, supabase, fetchDayData]);

  /** Manual job card assignment (Reception, Sick, etc.) — no trip linkage. */
  const handleJobAssign = useCallback(async (jobTypeId: string, halfDay: 'AM' | 'PM') => {
    if (!userOrgId || selectedStaffIds.length === 0) return;

    const relevantJobs = dailyJobs.filter(
      j => j.job_type_id === jobTypeId && j['AM/PM'] === halfDay
    );
    const existingStaffIds = new Set(relevantJobs.map((j: any) => j.staff_id));

    const toAdd    = selectedStaffIds.filter(id => !existingStaffIds.has(id));
    const toRemove = relevantJobs.filter((j: any) => selectedStaffIds.includes(j.staff_id));

    const ops: Promise<any>[] = [];
    if (toAdd.length > 0) {
      ops.push(supabase.from('staff_daily_job').insert(
        toAdd.map(staff_id => ({
          organization_id: userOrgId,
          staff_id,
          job_type_id: jobTypeId,
          job_date: selectedDate,
          'AM/PM': halfDay,
          trip_id: null,
        }))
      ));
      // Replace the Unassigned row for this half-day
      const unassignedId = jobTypes.find(jt => jt.name === 'Unassigned')?.id;
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

    await Promise.all(ops);
    setSelectedStaffIds([]);
    await fetchDayData();
  }, [userOrgId, selectedStaffIds, dailyJobs, selectedDate, supabase, fetchDayData]);

  /**
   * Activity assignment — inserts trip_staff with activity_id and a matching
   * staff_daily_job row using the job type whose name matches the activity.
   */
  const handleActivityAssign = useCallback(async (tripId: string, activityId: string) => {
    if (!userOrgId || selectedStaffIds.length === 0) return;

    const trip      = trips.find(t => t.id === tripId);
    const existing  = (trip?.trip_staff ?? []).filter((ts: any) => ts.activity_id === activityId);
    const existingIds = new Set(existing.map((ts: any) => ts.staff_id));

    const toAdd    = selectedStaffIds.filter(id => !existingIds.has(id));
    const toRemove = existing.filter((ts: any) => selectedStaffIds.includes(ts.staff_id));

    const half      = halfDayOf(trip?.start_time);
    const actName   = trip?.activities?.find((a: any) => a.id === activityId)?.name ?? '';
    const actJobId  = jobTypeId(actName) ?? jobTypeId('Course') ?? jobTypeId('Crew');

    const ops: Promise<any>[] = [];

    if (toAdd.length > 0) {
      ops.push(supabase.from('trip_staff').insert(
        toAdd.map(staff_id => ({ trip_id: tripId, staff_id, activity_id: activityId, role_id: null }))
      ));
      if (actJobId) {
        ops.push(supabase.from('staff_daily_job').insert(
          toAdd.map(staff_id => ({
            organization_id: userOrgId,
            staff_id,
            job_type_id: actJobId,
            job_date: selectedDate,
            'AM/PM': half,
            trip_id: tripId,
          }))
        ));
        // Replace the Unassigned row for this half-day
        const unassignedId = jobTypeId('Unassigned');
        if (unassignedId) {
          ops.push(supabase.from('staff_daily_job').delete()
            .in('staff_id', toAdd)
            .eq('job_type_id', unassignedId)
            .eq('job_date', selectedDate)
            .eq('AM/PM', half)
          );
        }
        // Replace the Crew sdj row for this trip — activity takes precedence
        const crewId = jobTypeId('Crew');
        if (crewId) {
          ops.push(supabase.from('staff_daily_job').delete()
            .in('staff_id', toAdd)
            .eq('job_type_id', crewId)
            .eq('trip_id', tripId)
            .eq('job_date', selectedDate)
          );
        }
      }
    }
    for (const ts of toRemove) {
      ops.push(supabase.from('trip_staff').delete().eq('id', ts.id));
      if (actJobId) {
        ops.push(supabase.from('staff_daily_job').delete()
          .eq('trip_id', tripId).eq('staff_id', ts.staff_id)
          .eq('job_type_id', actJobId).eq('job_date', selectedDate));
      }
      // If the staff still has a generic trip_staff row, restore the Crew sdj row
      const hasGeneric = (trip?.trip_staff ?? []).some(
        (s: any) => s.staff_id === ts.staff_id && !s.activity_id
      );
      const crewId = jobTypeId('Crew');
      if (hasGeneric && crewId && userOrgId) {
        ops.push(supabase.from('staff_daily_job').insert({
          organization_id: userOrgId,
          staff_id: ts.staff_id,
          job_type_id: crewId,
          job_date: selectedDate,
          'AM/PM': half,
          trip_id: tripId,
        }));
      }
    }

    await Promise.all(ops);
    setSelectedStaffIds([]);
    await fetchDayData();
  }, [userOrgId, selectedStaffIds, trips, selectedDate, jobTypes, supabase, fetchDayData]);

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
    const half = halfDayOf(trip?.start_time);
    const crewId = jobTypeId('Crew');

    const ops: Promise<any>[] = [
      supabase.from('trip_staff').delete().eq('id', tripStaffId),
    ];
    // Remove the activity-specific sdj row
    if (actJobId) {
      ops.push(supabase.from('staff_daily_job').delete()
        .eq('trip_id', tripId).eq('staff_id', staffId)
        .eq('job_type_id', actJobId).eq('job_date', selectedDate));
    }
    // Keep on trip if no generic row
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
    const ops: Promise<any>[] = rows.map(j =>
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

    await Promise.all([
      // Promote this staff member to Captain
      supabase.from('staff_daily_job')
        .update({ job_type_id: captainId })
        .eq('staff_id', staffId)
        .eq('trip_id', tripId)
        .eq('job_date', selectedDate),
      // Demote any existing Captain on this trip back to Crew
      supabase.from('staff_daily_job')
        .update({ job_type_id: crewId })
        .neq('staff_id', staffId)
        .eq('job_type_id', captainId)
        .eq('trip_id', tripId)
        .eq('job_date', selectedDate),
    ]);
    await fetchDayData();
  }, [userOrgId, selectedDate, jobTypes, supabase, fetchDayData]);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const morningTrips   = trips.filter(t => localHour(t.start_time) < 12);
  const afternoonTrips = trips.filter(t => localHour(t.start_time) >= 12);
  const amJobs = dailyJobs.filter(j => j['AM/PM'] === 'AM');
  const pmJobs = dailyJobs.filter(j => j['AM/PM'] === 'PM');

  // Staff members with no real job (only Unassigned rows, or no rows at all) for the selected date
  const unassignedStaffIds = useMemo(() => {
    const unassignedJobTypeId = jobTypes.find(jt => jt.name === 'Unassigned')?.id;
    const staffWithRealJobs = new Set(
      dailyJobs
        .filter(j => j.job_type_id !== unassignedJobTypeId)
        .map(j => j.staff_id)
    );
    return allStaff.filter(s => !staffWithRealJobs.has(s.id)).map(s => s.id);
  }, [dailyJobs, jobTypes, allStaff]);

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
          onTripAssign={handleTripAssign}
          onRemoveStaff={handleRemoveStaff}
          onJobAssign={handleJobAssign}
          onRemoveFromJob={handleRemoveFromJob}
          onActivityAssign={handleActivityAssign}
          onRemoveActivityStaff={handleRemoveActivityStaff}
          onAssignCaptain={handleAssignCaptain}
          onOpenTrip={setDrawerTripId}
        />
        <StaffPanel
          staff={allStaff}
          selectedIds={selectedStaffIds}
          unassignedIds={unassignedStaffIds}
          onToggle={id => setSelectedStaffIds(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
          )}
          onClear={() => setSelectedStaffIds([])}
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
