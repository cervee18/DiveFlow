-- Fix timezone direction bug in generate_trips_from_schedule.
-- generate_series(date, ...) resolves to timestamptz output, so adding a time
-- to it gives timestamptz. Applying AT TIME ZONE to a timestamptz converts
-- *from* UTC *to* local — the inverse of what we want.
-- Fix: cast date_val to date before adding slot.start_time so the sum is
-- timestamp without time zone, and AT TIME ZONE correctly interprets it
-- as local time and returns UTC.
CREATE OR REPLACE FUNCTION public.generate_trips_from_schedule(
  p_org_id      uuid,
  p_months_ahead int DEFAULT 24
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_timezone text;
  v_inserted int := 0;
  v_row      record;
BEGIN
  SELECT timezone INTO v_timezone
  FROM public.organizations
  WHERE id = p_org_id;

  v_timezone := COALESCE(v_timezone, 'UTC');

  FOR v_row IN
    SELECT
      slot.vessel_id,
      slot.trip_type_id,
      -- Cast to date first so sum is timestamp (no tz), then AT TIME ZONE
      -- interprets it as local time and returns UTC timestamptz.
      ((d.date_val::date + slot.start_time)::timestamp AT TIME ZONE v_timezone) AS trip_start,
      COALESCE(
        CASE WHEN tt.category = 'Snorkel'
             THEN v.capacity_snorkel
             ELSE v.capacity_dive
        END,
        14
      ) AS capacity
    FROM generate_series(
      CURRENT_DATE,
      CURRENT_DATE + (p_months_ahead || ' months')::interval,
      '1 day'::interval
    ) AS d(date_val)
    JOIN LATERAL (
      SELECT DISTINCT ON (wss.vessel_id, wss.start_time)
        wss.vessel_id, wss.trip_type_id, wss.start_time
      FROM public.weekly_schedule_slots wss
      WHERE wss.organization_id = p_org_id
        AND wss.day_of_week = EXTRACT(DOW FROM d.date_val::date)::smallint
        AND wss.valid_from <= d.date_val::date
      ORDER BY wss.vessel_id, wss.start_time, wss.valid_from DESC
    ) slot ON true
    JOIN public.trip_types tt ON tt.id = slot.trip_type_id
    JOIN public.vessels     v  ON v.id  = slot.vessel_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.trips ex
      WHERE ex.organization_id = p_org_id
        AND ex.vessel_id        = slot.vessel_id
        AND ex.start_time < ((d.date_val::date + slot.start_time)::timestamp AT TIME ZONE v_timezone) + INTERVAL '240 minutes'
        AND ex.start_time + (ex.duration_minutes * INTERVAL '1 minute') > ((d.date_val::date + slot.start_time)::timestamp AT TIME ZONE v_timezone)
    )
  LOOP
    BEGIN
      INSERT INTO public.trips (
        organization_id, vessel_id, trip_type_id,
        start_time, duration_minutes, max_divers, status
      ) VALUES (
        p_org_id,
        v_row.vessel_id,
        v_row.trip_type_id,
        v_row.trip_start,
        240,
        v_row.capacity,
        'active'
      );
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN v_inserted;
END;
$$;
