'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

import StaffTopBar from './components/StaffTopBar';
import StaffBoard  from './components/StaffBoard';
import { getTodayStr, localHour } from './components/dateUtils';

export default function StaffPage() {
  const supabase = createClient();

  const [selectedDate, setSelectedDate] = useState(getTodayStr);
  const [trips,        setTrips]        = useState<any[]>([]);
  const [jobTypes,     setJobTypes]     = useState<any[]>([]);
  const [dailyJobs,    setDailyJobs]    = useState<any[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [userOrgId,    setUserOrgId]    = useState<string | null>(null);

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

  // Fetch job types once per org (rarely change)
  useEffect(() => {
    if (!userOrgId) return;
    async function fetchJobTypes() {
      const { data } = await supabase
        .from('job_types')
        .select('id, name, sort_order')
        .eq('organization_id', userOrgId)
        .order('sort_order');
      if (data) setJobTypes(data);
    }
    fetchJobTypes();
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

      // Select * to safely include the 'AM/PM' column without PostgREST parsing issues
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

  // Split trips by hour — morning < 12:00, afternoon/night >= 12:00
  const morningTrips   = trips.filter(t => localHour(t.start_time) < 12);
  const afternoonTrips = trips.filter(t => localHour(t.start_time) >= 12);

  // Split job assignments by AM/PM column value
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
      <StaffBoard
        morningTrips={morningTrips}
        afternoonTrips={afternoonTrips}
        amJobs={amJobs}
        pmJobs={pmJobs}
        jobTypes={jobTypes}
        isLoading={isLoading}
        selectedDate={selectedDate}
      />
    </div>
  );
}
