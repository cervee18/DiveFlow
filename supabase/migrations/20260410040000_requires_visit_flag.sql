-- ── 1. Org-level default ────────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS require_visit_for_trips boolean NOT NULL DEFAULT false;

-- ── 2. Per-client flag ───────────────────────────────────────────────────────
-- Default true so existing clients (hotel guests) keep the current behaviour
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS requires_visit boolean NOT NULL DEFAULT true;

-- ── 3. BEFORE INSERT on trip_clients: enforce visit if client requires it ────
CREATE OR REPLACE FUNCTION public.guard_trip_client_visit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_requires_visit boolean;
  v_trip_date      date;
BEGIN
  SELECT requires_visit INTO v_requires_visit
  FROM public.clients WHERE id = NEW.client_id;

  -- Local residents skip the check entirely
  IF NOT COALESCE(v_requires_visit, true) THEN
    RETURN NEW;
  END IF;

  SELECT start_time::date INTO v_trip_date
  FROM public.trips WHERE id = NEW.trip_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.visit_clients vc
    JOIN public.visits v ON v.id = vc.visit_id
    WHERE vc.client_id = NEW.client_id
      AND v.start_date <= v_trip_date
      AND v.end_date   >= v_trip_date
  ) THEN
    RAISE EXCEPTION
      'Client requires an active visit covering % to be added to a trip. Create a visit first, or mark the client as a local resident.',
      v_trip_date
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_trip_client_visit ON public.trip_clients;
DO $$ BEGIN
  CREATE TRIGGER guard_trip_client_visit
    BEFORE INSERT ON public.trip_clients
    FOR EACH ROW EXECUTE FUNCTION public.guard_trip_client_visit();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. AFTER DELETE on visit_clients: cascade to trips in the visit range ───
-- When a client is removed from a visit, remove them from all trips that
-- fall within that visit's date range — but only if they require a visit.
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
    RETURN OLD; -- Local residents manage their own trip membership
  END IF;

  SELECT start_date, end_date INTO v_start_date, v_end_date
  FROM public.visits WHERE id = OLD.visit_id;

  -- Remove from all trips in the visit window
  DELETE FROM public.trip_clients tc
  USING public.trips t
  WHERE tc.trip_id    = t.id
    AND tc.client_id  = OLD.client_id
    AND t.start_time::date >= v_start_date
    AND t.start_time::date <= v_end_date;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cascade_trip_removal_on_visit_client_delete ON public.visit_clients;
DO $$ BEGIN
  CREATE TRIGGER cascade_trip_removal_on_visit_client_delete
    AFTER DELETE ON public.visit_clients
    FOR EACH ROW EXECUTE FUNCTION public.cascade_trip_removal_on_visit_client_delete();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Note: if visit_clients has ON DELETE CASCADE from visits, deleting a visit
-- will fire the above trigger for each member automatically.
-- The payment guard (guard_visit_deletion) already prevents deleting visits
-- with active payments, so the cascade only fires on unpaid / voided visits.
