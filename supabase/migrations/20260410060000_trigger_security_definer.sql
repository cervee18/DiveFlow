-- All visit/trip trigger functions must be SECURITY DEFINER so they run as
-- the function owner (postgres) and bypass RLS on the tables they inspect.
-- Without this, the triggers run as the calling authenticated user and RLS
-- prevents them from seeing pos_payments, pos_invoices, trip_clients, etc.

-- ── 1. guard_visit_deletion ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_visit_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pos_payments pp
    JOIN public.pos_invoices pi ON pi.id = pp.invoice_id
    WHERE pi.visit_id = OLD.id
      AND pp.voided_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot delete this visit: it has recorded payments. Void all payments first.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

-- ── 2. cascade_trips_on_visit_delete ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_trips_on_visit_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.trip_clients tc
  USING public.trips t,
        public.visit_clients vc,
        public.clients c
  WHERE tc.trip_id   = t.id
    AND tc.client_id = vc.client_id
    AND vc.visit_id  = OLD.id
    AND c.id         = vc.client_id
    AND c.requires_visit = true
    AND t.start_time::date >= OLD.start_date
    AND t.start_time::date <= OLD.end_date;

  RETURN OLD;
END;
$$;

-- ── 3. cascade_trip_removal_on_visit_client_delete ───────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_trip_removal_on_visit_client_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- If visit no longer exists (whole-visit delete — handled by cascade_trips_on_visit_delete)
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

-- ── 4. guard_trip_client_visit ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_trip_client_visit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requires_visit boolean;
  v_trip_date      date;
BEGIN
  SELECT requires_visit INTO v_requires_visit
  FROM public.clients WHERE id = NEW.client_id;

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
