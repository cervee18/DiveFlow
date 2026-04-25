-- Auto-confirm trips: trips are always generated from the weekly schedule and
-- immediately available for online booking. Staff cancels individual trips
-- instead of confirming them.

-- Step 1: Add status to trips
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'cancelled'));

CREATE INDEX IF NOT EXISTS trips_org_status_time_idx
  ON public.trips(organization_id, status, start_time);

-- Step 2: Generate confirmed trips from the weekly schedule.
-- Idempotent: skips dates where any trip (active or cancelled) already exists
-- for the same (org, vessel, start_time) to avoid recreating cancelled trips.
-- Uses the organization's stored timezone to convert slot time to timestamptz.
CREATE OR REPLACE FUNCTION public.generate_trips_from_schedule(
  p_org_id      uuid,
  p_months_ahead int DEFAULT 24
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_timezone text;
  v_inserted int;
BEGIN
  SELECT timezone INTO v_timezone
  FROM public.organizations
  WHERE id = p_org_id;

  v_timezone := COALESCE(v_timezone, 'UTC');

  INSERT INTO public.trips (
    organization_id, vessel_id, trip_type_id,
    start_time, duration_minutes, max_divers, status
  )
  SELECT
    p_org_id,
    slot.vessel_id,
    slot.trip_type_id,
    ((d.date_val + slot.start_time)::timestamp AT TIME ZONE v_timezone),
    240,
    COALESCE(
      CASE WHEN tt.category = 'Snorkel'
           THEN v.capacity_snorkel
           ELSE v.capacity_dive
      END,
      14
    ),
    'active'
  FROM generate_series(
    CURRENT_DATE,
    CURRENT_DATE + (p_months_ahead || ' months')::interval,
    '1 day'::interval
  ) AS d(date_val)
  -- Latest applicable slot per (vessel, start_time) for this day-of-week
  JOIN LATERAL (
    SELECT DISTINCT ON (wss.vessel_id, wss.start_time)
      wss.vessel_id, wss.trip_type_id, wss.start_time
    FROM public.weekly_schedule_slots wss
    WHERE wss.organization_id = p_org_id
      AND wss.day_of_week = EXTRACT(DOW FROM d.date_val)::smallint
      AND wss.valid_from <= d.date_val::date
    ORDER BY wss.vessel_id, wss.start_time, wss.valid_from DESC
  ) slot ON true
  JOIN public.trip_types tt ON tt.id = slot.trip_type_id
  JOIN public.vessels     v  ON v.id  = slot.vessel_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.trips ex
    WHERE ex.organization_id = p_org_id
      AND ex.vessel_id        = slot.vessel_id
      -- Skip if any existing trip (active or cancelled) overlaps the 240-min window
      AND ex.start_time < ((d.date_val + slot.start_time)::timestamp AT TIME ZONE v_timezone) + INTERVAL '240 minutes'
      AND ex.start_time + (ex.duration_minutes * INTERVAL '1 minute') > ((d.date_val + slot.start_time)::timestamp AT TIME ZONE v_timezone)
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- Step 3: Update get_overview_trips to exclude cancelled trips
CREATE OR REPLACE FUNCTION "public"."get_overview_trips"(
  "p_org_id" "uuid",
  "p_start"  timestamp with time zone,
  "p_end"    timestamp with time zone
)
RETURNS TABLE(
  "id"                        "uuid",
  "label"                     "text",
  "start_time"                timestamp with time zone,
  "max_divers"                integer,
  "entry_mode"                "text",
  "vessel_id"                 "uuid",
  "vessel_name"               "text",
  "vessel_abbreviation"       "text",
  "trip_type_name"            "text",
  "trip_type_abbreviation"    "text",
  "trip_type_color"           "text",
  "trip_type_category"        "text",
  "trip_type_number_of_dives" integer,
  "booked_divers"             bigint,
  "activity_counts"           "jsonb"
)
LANGUAGE "sql" STABLE SECURITY DEFINER
AS $$
  SELECT
    t.id,
    t.label,
    t.start_time,
    t.max_divers,
    t.entry_mode,
    t.vessel_id,
    v.name             AS vessel_name,
    v.abbreviation     AS vessel_abbreviation,
    tt.name            AS trip_type_name,
    tt.abbreviation    AS trip_type_abbreviation,
    tt.color           AS trip_type_color,
    tt.category        AS trip_type_category,
    tt.number_of_dives AS trip_type_number_of_dives,

    (
      SELECT COUNT(*)
      FROM public.trip_clients tc
      WHERE tc.trip_id = t.id
    ) + COALESCE((
      SELECT SUM(ob.pax_count)
      FROM public.online_bookings ob
      WHERE ob.trip_id = t.id
        AND ob.status IN ('held', 'confirmed')
        AND (ob.status = 'confirmed' OR ob.hold_expires_at > now())
    ), 0) AS booked_divers,

    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'name',         a.name,
            'abbreviation', COALESCE(a.abbreviation, a.name),
            'count',        ac.cnt
          )
          ORDER BY a.name
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT activity_id, COUNT(*) AS cnt
        FROM public.trip_clients
        WHERE trip_id = t.id
          AND activity_id IS NOT NULL
        GROUP BY activity_id
      ) ac
      JOIN public.activities a ON a.id = ac.activity_id
    ) AS activity_counts

  FROM public.trips t
  LEFT JOIN public.vessels    v  ON v.id  = t.vessel_id
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  WHERE t.organization_id = p_org_id
    AND t.start_time      >= p_start
    AND t.start_time       < p_end
    AND t.status           = 'active'
  ORDER BY t.start_time ASC;
$$;

-- Step 4: Update get_trip_available_spaces to reject cancelled trips
CREATE OR REPLACE FUNCTION public.get_trip_available_spaces(p_trip_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    t.max_divers
    - (SELECT COUNT(*)::integer FROM public.trip_clients tc WHERE tc.trip_id = t.id)
    - COALESCE((
        SELECT SUM(ob.pax_count)::integer
        FROM public.online_bookings ob
        WHERE ob.trip_id = t.id
          AND ob.status IN ('held', 'confirmed')
          AND (ob.status = 'confirmed' OR ob.hold_expires_at > now())
      ), 0)
  FROM public.trips t
  WHERE t.id     = p_trip_id
    AND t.status = 'active';
$$;

-- Step 5: Seed trips for all existing organisations
DO $$
DECLARE
  org record;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP
    PERFORM public.generate_trips_from_schedule(org.id, 24);
  END LOOP;
END;
$$;
