-- ============================================================
-- Improvement: add trip_type and vessel_name to trip-related
-- activity_log metadata so the Logs page can show meaningful
-- context without relying on the optional label field.
-- ============================================================


-- ── log_trip_change ───────────────────────────────────────────────────────────

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
