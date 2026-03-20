'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

import StaffTopBar from './components/StaffTopBar';
import StaffBoard  from './components/StaffBoard';
import StaffPanel  from './components/StaffPanel';
import { getTodayStr, localHour } from './components/dateUtils';

export default function StaffPage() {
  const supabase = createClient();

  const [selectedDate,     setSelectedDate]     = useState(getTodayStr);
  const [trips,            setTrips]            = useState<any[]>([]);
  const [jobTypes,         setJobTypes]         = useState<any[]>([]);
  const [dailyJobs,        setDailyJobs]        = useState<any[]>([]);
  const [allStaff,         setAllStaff]         = useState<any[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [isLoading,        setIsLoading]        = useState(false);
  const [userOrgId,        setUserOrgId]        = useState<string | null>(null);

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

  // Fetch job types + staff list once per org (rarely change)
  useEffect(() => {
    if (!userOrgId) return;
    async function fetchStaticData() {
      const [jobTypesRes, staffRes] = await Promise.all([
        supabase
          .from('job_types')
          .select('id, name, sort_order')
          .eq('organization_id', userOrgId)
          .order('sort_order'),
        supabase
          .from('staff')
          .select('id, first_name, last_name, initials')
          .eq('organization_id', userOrgId)
          .order('first_name'),
      ]);
      if (jobTypesRes.data) setJobTypes(jobTypesRes.data);
      if (staffRes.data)    setAllStaff(staffRes.data);
    }
    fetchStaticData();
  }, [userOrgId, supabase]);

  // Fetch trips + daily job assignments whenever date or org changes
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
          trip_clients ( id ),
          vessels      ( name, abbreviation ),
          trip_types   ( name, number_of_dives ),
          trip_staff   ( staff_id, staff ( id, initials, first_name, last_name ) )
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
      setTrips(tripsRes.data.map(t => ({
        ...t,
        booked_divers: t.trip_clients?.length ?? 0,
      })));
    }
    if (!jobsRes.error && jobsRes.data) {
      setDailyJobs(jobsRes.data);
    }

    setIsLoading(false);
  }, [selectedDate, userOrgId, supabase]);

  useEffect(() => { fetchDayData(); }, [fetchDayData]);

  // Assign / unassign selected staff to a trip (toggle per staff member)
  const handleTripAssign = useCallback(async (tripId: string) => {
    if (selectedStaffIds.length === 0) return;

    const trip = trips.find(t => t.id === tripId);
    const existingIds = new Set((trip?.trip_staff ?? []).map((ts: any) => ts.staff_id));

    const toAdd    = selectedStaffIds.filter(id => !existingIds.has(id));
    const toRemove = selectedStaffIds.filter(id =>  existingIds.has(id));

    const ops: Promise<any>[] = [];

    if (toAdd.length > 0) {
      ops.push(
        supabase.from('trip_staff').insert(
          toAdd.map(staff_id => ({ trip_id: tripId, staff_id, role_id: null }))
        )
      );
    }
    for (const staff_id of toRemove) {
      ops.push(
        supabase.from('trip_staff').delete()
          .eq('trip_id', tripId)
          .eq('staff_id', staff_id)
      );
    }

    await Promise.all(ops);
    setSelectedStaffIds([]);
    await fetchDayData();
  }, [selectedStaffIds, trips, supabase, fetchDayData]);

  // Remove a single staff member from a trip directly
  const handleRemoveStaff = useCallback(async (tripId: string, staffId: string) => {
    await supabase.from('trip_staff').delete()
      .eq('trip_id', tripId)
      .eq('staff_id', staffId);
    await fetchDayData();
  }, [supabase, fetchDayData]);

  // Assign / unassign selected staff to a daily job slot (toggle per staff member)
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
      ops.push(
        supabase.from('staff_daily_job').insert(
          toAdd.map(staff_id => ({
            organization_id: userOrgId,
            staff_id,
            job_type_id: jobTypeId,
            job_date: selectedDate,
            'AM/PM': halfDay,
          }))
        )
      );
    }
    for (const job of toRemove) {
      ops.push(supabase.from('staff_daily_job').delete().eq('id', job.id));
    }

    await Promise.all(ops);
    setSelectedStaffIds([]);
    await fetchDayData();
  }, [userOrgId, selectedStaffIds, dailyJobs, selectedDate, supabase, fetchDayData]);

  // Remove a single staff member from a daily job slot directly
  const handleRemoveFromJob = useCallback(async (jobId: string) => {
    await supabase.from('staff_daily_job').delete().eq('id', jobId);
    await fetchDayData();
  }, [supabase, fetchDayData]);

  // Split trips by hour
  const morningTrips   = trips.filter(t => localHour(t.start_time) < 12);
  const afternoonTrips = trips.filter(t => localHour(t.start_time) >= 12);

  // Split job assignments by AM/PM
  const amJobs = dailyJobs.filter(j => j['AM/PM'] === 'AM');
  const pmJobs = dailyJobs.filter(j => j['AM/PM'] === 'PM');

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
        />
        <StaffPanel
          staff={allStaff}
          selectedIds={selectedStaffIds}
          onToggle={id => setSelectedStaffIds(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
          )}
          onClear={() => setSelectedStaffIds([])}
        />
      </div>
    </div>
  );
}
