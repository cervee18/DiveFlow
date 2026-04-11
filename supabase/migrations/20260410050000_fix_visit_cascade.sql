-- Fix the cascade bug: the AFTER DELETE trigger on visit_clients fires after
-- the parent visit is already deleted (via FK CASCADE), so it can't look up
-- the visit's date range. Move the full cascade into a BEFORE DELETE trigger
-- on visits itself, where the dates are still available.

-- ── 1. New BEFORE DELETE trigger on visits ───────────────────────────────────
-- Runs before the visit row (and its FK cascades) are processed.
-- Removes trip_clients for every visit member who requires_visit = true.
CREATE OR REPLACE FUNCTION public.cascade_trips_on_visit_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.trip_clients tc
  USING public.trips t,
        public.visit_clients vc,
        public.clients c
  WHERE tc.trip_id    = t.id
    AND tc.client_id  = vc.client_id
    AND vc.visit_id   = OLD.id
    AND c.id          = vc.client_id
    AND c.requires_visit = true
    AND t.start_time::date >= OLD.start_date
    AND t.start_time::date <= OLD.end_date;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cascade_trips_on_visit_delete ON public.visits;
CREATE TRIGGER cascade_trips_on_visit_delete
  BEFORE DELETE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.cascade_trips_on_visit_delete();

-- ── 2. Keep / fix the AFTER DELETE trigger on visit_clients ─────────────────
-- This fires when a SINGLE client is manually removed from a visit (visit still
-- exists at this point so the date lookup works correctly). When the whole visit
-- is deleted the new trigger above handles it first, so these rows are already
-- cleaned up before the CASCADE fires.
CREATE OR REPLACE FUNCTION public.cascade_trip_removal_on_visit_client_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_requires_visit boolean;
  v_start_date     date;
  v_end_date       date;
BEGIN
  SELECT requires_visit INTO v_requires_visit
  FROM public.clients WHERE id = OLD.client_id;

  IF NOT COALESCE(v_requires_visit, true) THEN
    RETURN OLD;
  END IF;

  -- If visit no longer exists (whole-visit delete path), nothing to do here —
  -- cascade_trips_on_visit_delete already handled it.
  SELECT start_date, end_date INTO v_start_date, v_end_date
  FROM public.visits WHERE id = OLD.visit_id;

  IF v_start_date IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.trip_clients tc
  USING public.trips t
  WHERE tc.trip_id   = t.id
    AND tc.client_id = OLD.client_id
    AND t.start_time::date >= v_start_date
    AND t.start_time::date <= v_end_date;

  RETURN OLD;
END;
$$;

-- Trigger already exists; replace its function body above, no need to recreate.
