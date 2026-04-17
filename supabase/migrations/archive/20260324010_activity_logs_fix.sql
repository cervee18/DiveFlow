-- ============================================================
-- Fix: activity_logs trigger functions
--
-- Root cause: COALESCE(NEW.field, OLD.field) inside the INSERT
-- VALUES clause is unreliable for DELETE triggers because NEW is
-- a null record and field access on it may not coerce cleanly.
-- Fix: resolve all NEW/OLD values into typed variables via a
-- TG_OP check BEFORE the INSERT statement.
-- ============================================================


-- ── log_trip_client_change ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_trip_client_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id      uuid;
  v_client_name text;
  v_trip_label  text;
  v_trip_start  timestamptz;
  v_client_id   uuid;
  v_trip_id     uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_client_id := NEW.client_id;
    v_trip_id   := NEW.trip_id;
  ELSE
    v_client_id := OLD.client_id;
    v_trip_id   := OLD.trip_id;
  END IF;

  SELECT organization_id, start_time,
         COALESCE(label, to_char(start_time AT TIME ZONE 'UTC', 'Mon DD HH24:MI'))
  INTO v_org_id, v_trip_start, v_trip_label
  FROM public.trips
  WHERE id = v_trip_id;

  -- Trip not found: it is being cascade-deleted in the same statement.
  -- The deleted_trip log entry from log_trip_change covers this case.
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT first_name || ' ' || last_name
  INTO v_client_name
  FROM public.clients
  WHERE id = v_client_id;

  INSERT INTO public.activity_logs (
    organization_id, actor_auth_uid, action, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id,
    auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'added_to_trip' ELSE 'removed_from_trip' END,
    'trip_client',
    v_trip_id,
    jsonb_build_object(
      'client_id',   v_client_id,
      'client_name', v_client_name,
      'trip_label',  v_trip_label,
      'trip_start',  v_trip_start
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ── log_trip_change ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_trip_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_id     uuid;
  v_label  text;
  v_start  timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org_id := NEW.organization_id;
    v_id     := NEW.id;
    v_label  := COALESCE(NEW.label, to_char(NEW.start_time AT TIME ZONE 'UTC', 'Mon DD HH24:MI'));
    v_start  := NEW.start_time;
  ELSE
    v_org_id := OLD.organization_id;
    v_id     := OLD.id;
    v_label  := COALESCE(OLD.label, to_char(OLD.start_time AT TIME ZONE 'UTC', 'Mon DD HH24:MI'));
    v_start  := OLD.start_time;
  END IF;

  INSERT INTO public.activity_logs (
    organization_id, actor_auth_uid, action, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id,
    auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'created_trip' ELSE 'deleted_trip' END,
    'trip',
    v_id,
    jsonb_build_object(
      'trip_label', v_label,
      'trip_start', v_start
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ── log_staff_job_change ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_staff_job_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff_name text;
  v_job_name   text;
  v_trip_label text;
  v_sdj_id     uuid;
  v_staff_id   uuid;
  v_job_id     uuid;
  v_org_id     uuid;
  v_trip_id    uuid;
  v_job_date   date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_sdj_id   := NEW.id;
    v_staff_id := NEW.staff_id;
    v_job_id   := NEW.job_type_id;
    v_org_id   := NEW.organization_id;
    v_trip_id  := NEW.trip_id;
    v_job_date := NEW.job_date;
  ELSE
    v_sdj_id   := OLD.id;
    v_staff_id := OLD.staff_id;
    v_job_id   := OLD.job_type_id;
    v_org_id   := OLD.organization_id;
    v_trip_id  := OLD.trip_id;
    v_job_date := OLD.job_date;
  END IF;

  -- Resolve job name; skip 'Unassigned' placeholder rows
  SELECT name INTO v_job_name FROM public.job_types WHERE id = v_job_id;
  IF v_job_name = 'Unassigned' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT first_name || ' ' || last_name INTO v_staff_name
  FROM public.staff WHERE id = v_staff_id;

  -- Optionally resolve trip label when job is linked to a trip
  IF v_trip_id IS NOT NULL THEN
    SELECT COALESCE(label, to_char(start_time AT TIME ZONE 'UTC', 'Mon DD HH24:MI'))
    INTO v_trip_label
    FROM public.trips WHERE id = v_trip_id;
  END IF;

  INSERT INTO public.activity_logs (
    organization_id, actor_auth_uid, action, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id,
    auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'assigned_staff' ELSE 'unassigned_staff' END,
    'staff_job',
    v_sdj_id,
    jsonb_build_object(
      'staff_name', v_staff_name,
      'job_name',   v_job_name,
      'job_date',   v_job_date,
      'trip_label', v_trip_label
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
