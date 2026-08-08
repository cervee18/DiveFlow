-- Fix trip times seeded with an incorrect timezone conversion.
-- The 2026-08-08 catch-up seed (in 20260424000003/000004) ran through an
-- intermediate version of generate_trips_from_schedule that still applied
-- AT TIME ZONE conversion, shifting every trip by the org's UTC offset
-- (e.g. Europe/Madrid trips landed 2 hours earlier than their configured
-- weekly_schedule_slots time). The function now live (from
-- 20260424000006_naive_utc_times.sql) stores slot times as literal UTC with
-- no conversion, so re-clearing and re-seeding with the current function
-- produces correctly-aligned trip times. Still all test data, no real
-- bookings exist yet (confirmed with user).
DELETE FROM public.trips;

DO $$
DECLARE
  org record;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP
    PERFORM public.generate_trips_from_schedule(org.id, 24);
  END LOOP;
END;
$$;
