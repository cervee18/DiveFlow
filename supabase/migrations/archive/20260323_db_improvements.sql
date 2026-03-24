-- ============================================================
-- Migration: DB-side improvements
--   1. Capacity enforcement trigger on trip_clients
--   2. create_trip_series() — atomic batch trip creation
--   3. get_overview_trips()  — aggregated trip data for the overview board
-- ============================================================


-- ── 1. Capacity enforcement ───────────────────────────────────────────────────
--
-- Prevents inserting a client into a trip that is already at max_divers.
-- Raises SQLSTATE P0001 with message prefix 'trip_capacity_exceeded' so the
-- app can show a friendly error instead of a generic one.

CREATE OR REPLACE FUNCTION public.check_trip_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_divers integer;
  v_booked     integer;
BEGIN
  SELECT max_divers INTO v_max_divers
  FROM public.trips
  WHERE id = NEW.trip_id;

  -- Count existing rows, excluding the row being updated (UPDATE path)
  SELECT COUNT(*) INTO v_booked
  FROM public.trip_clients
  WHERE trip_id = NEW.trip_id
    AND id IS DISTINCT FROM NEW.id;

  IF v_booked >= v_max_divers THEN
    RAISE EXCEPTION 'trip_capacity_exceeded: trip is full (% / %)', v_booked, v_max_divers
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_trip_capacity ON public.trip_clients;

CREATE TRIGGER trg_check_trip_capacity
  BEFORE INSERT OR UPDATE ON public.trip_clients
  FOR EACH ROW EXECUTE FUNCTION public.check_trip_capacity();


-- ── 2. create_trip_series ─────────────────────────────────────────────────────
--
-- Creates one trip per timestamp in p_start_times, all sharing the same
-- series_id (generated here). Returns the array of new trip UUIDs.
-- Running inside a single transaction — all succeed or all fail.

CREATE OR REPLACE FUNCTION public.create_trip_series(
  p_org_id        uuid,
  p_label         text,
  p_trip_type_id  uuid,
  p_entry_mode    text,
  p_duration_mins integer,
  p_max_divers    integer,
  p_vessel_id     uuid,
  p_start_times   timestamptz[]
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_series_id uuid := gen_random_uuid();
  v_ids       uuid[];
BEGIN
  WITH inserted AS (
    INSERT INTO public.trips (
      organization_id,
      label,
      trip_type_id,
      entry_mode,
      duration_minutes,
      max_divers,
      vessel_id,
      start_time,
      series_id
    )
    SELECT
      p_org_id,
      p_label,
      p_trip_type_id,
      p_entry_mode,
      p_duration_mins,
      p_max_divers,
      p_vessel_id,
      t,
      v_series_id
    FROM unnest(p_start_times) AS t
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM inserted;

  RETURN v_ids;
END;
$$;


-- ── 3. get_overview_trips ─────────────────────────────────────────────────────
--
-- Returns all trips in a date window with pre-aggregated booked_divers and
-- activity_counts, eliminating the need to fetch individual trip_client rows.
--
-- activity_counts shape: [{"name":"DSD","abbreviation":"DSD","count":3}, ...]

CREATE OR REPLACE FUNCTION public.get_overview_trips(
  p_org_id  uuid,
  p_start   timestamptz,
  p_end     timestamptz
)
RETURNS TABLE (
  id                         uuid,
  label                      text,
  start_time                 timestamptz,
  max_divers                 integer,
  entry_mode                 text,
  vessel_id                  uuid,
  vessel_name                text,
  vessel_abbreviation        text,
  trip_type_name             text,
  trip_type_abbreviation     text,
  trip_type_color            text,
  trip_type_category         text,
  trip_type_number_of_dives  integer,
  booked_divers              bigint,
  activity_counts            jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    t.id,
    t.label,
    t.start_time,
    t.max_divers,
    t.entry_mode,
    t.vessel_id,
    v.name                AS vessel_name,
    v.abbreviation        AS vessel_abbreviation,
    tt.name               AS trip_type_name,
    tt.abbreviation       AS trip_type_abbreviation,
    tt.color              AS trip_type_color,
    tt.category           AS trip_type_category,
    tt.number_of_dives    AS trip_type_number_of_dives,

    -- Booked diver count (no need to send all UUIDs to the client)
    (
      SELECT COUNT(*)
      FROM public.trip_clients tc
      WHERE tc.trip_id = t.id
    ) AS booked_divers,

    -- Activity breakdown as compact JSON array
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
  ORDER BY t.start_time ASC;
$$;
