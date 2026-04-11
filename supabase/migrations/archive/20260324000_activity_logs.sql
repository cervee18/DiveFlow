-- ============================================================
-- Migration: Activity Logs
--   1. activity_logs table
--   2. Trigger: trip_clients INSERT/DELETE  → added_to_trip / removed_from_trip
--   3. Trigger: trips INSERT/DELETE         → created_trip / deleted_trip
--   4. Trigger: clients INSERT              → registered_client
--   5. Trigger: staff_daily_job INSERT/DELETE → assigned_staff / unassigned_staff
--   6. get_activity_logs() RPC for the admin Logs page
-- ============================================================


-- ── 1. activity_logs table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_auth_uid  uuid,                    -- auth.uid() at time of action
  action          text        NOT NULL,    -- see vocabulary below
  entity_type     text        NOT NULL,    -- 'trip_client' | 'trip' | 'client' | 'staff_job'
  entity_id       uuid,                    -- primary entity (trip_id for trip_client events)
  metadata        jsonb,                   -- human-readable labels captured at write time
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_org_created
  ON public.activity_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS activity_logs_org_type_created
  ON public.activity_logs (organization_id, entity_type, created_at DESC);


-- ── 2. trip_clients trigger ───────────────────────────────────────────────────
--
-- Fires on INSERT (client added to trip) and DELETE (client removed from trip).
-- Resolves client name and trip label at write time and stores them in metadata.

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
  v_type_id     uuid;
  v_vessel_id   uuid;
  v_trip_type   text;
  v_vessel      text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_client_id := NEW.client_id;
    v_trip_id   := NEW.trip_id;
  ELSE
    v_client_id := OLD.client_id;
    v_trip_id   := OLD.trip_id;
  END IF;

  SELECT organization_id, start_time, label, trip_type_id, vessel_id
  INTO v_org_id, v_trip_start, v_trip_label, v_type_id, v_vessel_id
  FROM public.trips
  WHERE id = v_trip_id;

  -- Trip not found: it is being cascade-deleted in the same statement.
  -- The deleted_trip log entry from log_trip_change covers this case.
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT name INTO v_trip_type FROM public.trip_types WHERE id = v_type_id;
  SELECT name INTO v_vessel    FROM public.vessels     WHERE id = v_vessel_id;

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
      'trip_start',  v_trip_start,
      'trip_type',   v_trip_type,
      'vessel_name', v_vessel
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_trip_client ON public.trip_clients;

CREATE TRIGGER trg_log_trip_client
  AFTER INSERT OR DELETE ON public.trip_clients
  FOR EACH ROW EXECUTE FUNCTION public.log_trip_client_change();


-- ── 3. trips trigger ──────────────────────────────────────────────────────────
--
-- Fires on INSERT (trip created) and DELETE (trip deleted).

CREATE OR REPLACE FUNCTION public.log_trip_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id      uuid;
  v_id          uuid;
  v_label       text;
  v_start       timestamptz;
  v_type_id     uuid;
  v_vessel_id   uuid;
  v_trip_type   text;
  v_vessel      text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org_id    := NEW.organization_id;
    v_id        := NEW.id;
    v_label     := NEW.label;
    v_start     := NEW.start_time;
    v_type_id   := NEW.trip_type_id;
    v_vessel_id := NEW.vessel_id;
  ELSE
    v_org_id    := OLD.organization_id;
    v_id        := OLD.id;
    v_label     := OLD.label;
    v_start     := OLD.start_time;
    v_type_id   := OLD.trip_type_id;
    v_vessel_id := OLD.vessel_id;
  END IF;

  SELECT name INTO v_trip_type FROM public.trip_types WHERE id = v_type_id;
  SELECT name INTO v_vessel    FROM public.vessels     WHERE id = v_vessel_id;

  INSERT INTO public.activity_logs (
    organization_id, actor_auth_uid, action, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id,
    auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'created_trip' ELSE 'deleted_trip' END,
    'trip',
    v_id,
    jsonb_build_object(
      'trip_label',  v_label,
      'trip_start',  v_start,
      'trip_type',   v_trip_type,
      'vessel_name', v_vessel
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_log_trip ON public.trips;

CREATE TRIGGER trg_log_trip
  AFTER INSERT OR DELETE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.log_trip_change();


-- ── 4. clients trigger ────────────────────────────────────────────────────────
--
-- Fires on INSERT (new client registered).

CREATE OR REPLACE FUNCTION public.log_client_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.activity_logs (
    organization_id, actor_auth_uid, action, entity_type, entity_id, metadata
  ) VALUES (
    NEW.organization_id,
    auth.uid(),
    'registered_client',
    'client',
    NEW.id,
    jsonb_build_object(
      'client_name', NEW.first_name || ' ' || NEW.last_name
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_client ON public.clients;

CREATE TRIGGER trg_log_client
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_client_insert();


-- ── 5. staff_daily_job trigger ────────────────────────────────────────────────
--
-- Fires on INSERT and DELETE, but skips rows whose job_type is named 'Unassigned'
-- (those are auto-generated placeholder rows, not real assignments).

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

DROP TRIGGER IF EXISTS trg_log_staff_job ON public.staff_daily_job;

CREATE TRIGGER trg_log_staff_job
  AFTER INSERT OR DELETE ON public.staff_daily_job
  FOR EACH ROW EXECUTE FUNCTION public.log_staff_job_change();


-- ── 6. get_activity_logs RPC ──────────────────────────────────────────────────
--
-- Returns paginated activity log entries with actor name resolved from the
-- staff table via staff.user_id = actor_auth_uid.
-- Falls back to 'System' when the actor cannot be resolved.

CREATE OR REPLACE FUNCTION public.get_activity_logs(
  p_org_id      uuid,
  p_entity_type text        DEFAULT NULL,   -- NULL = all types
  p_from        timestamptz DEFAULT NULL,
  p_to          timestamptz DEFAULT NULL,
  p_limit       integer     DEFAULT 50,
  p_offset      integer     DEFAULT 0
)
RETURNS TABLE (
  id           uuid,
  action       text,
  entity_type  text,
  entity_id    uuid,
  metadata     jsonb,
  actor_name   text,
  created_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    al.id,
    al.action,
    al.entity_type,
    al.entity_id,
    al.metadata,
    COALESCE(s.first_name || ' ' || s.last_name, 'System') AS actor_name,
    al.created_at
  FROM public.activity_logs al
  LEFT JOIN public.staff s
    ON s.user_id = al.actor_auth_uid
   AND s.organization_id = al.organization_id
  WHERE al.organization_id = p_org_id
    AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND (p_from IS NULL OR al.created_at >= p_from)
    AND (p_to   IS NULL OR al.created_at <  p_to)
  ORDER BY al.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;
