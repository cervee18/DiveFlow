


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."entry_mode_type" AS ENUM (
    'Boat',
    'Shore',
    'Both'
);


ALTER TYPE "public"."entry_mode_type" OWNER TO "postgres";


CREATE TYPE "public"."equipment_condition" AS ENUM (
    'Excellent',
    'Good',
    'Needs Service',
    'Retired'
);


ALTER TYPE "public"."equipment_condition" OWNER TO "postgres";


CREATE TYPE "public"."subscription_plan_type" AS ENUM (
    'Basic',
    'Pro',
    'Enterprise'
);


ALTER TYPE "public"."subscription_plan_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'client',
    'staff_1',
    'staff_2',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_client_to_organization"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_org_id uuid;
  v_admin_role text;
  v_user_email text;
  v_first_name text;
  v_last_name text;
  v_exists boolean;
BEGIN
  SELECT organization_id, role::text INTO v_org_id, v_admin_role
  FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_admin_role, '') != 'admin' THEN
    RAISE EXCEPTION 'unauthorized: lacking admin privileges';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.clients WHERE user_id = p_user_id AND organization_id = v_org_id)
  INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'User is already a client in your dive center.';
  END IF;

  SELECT email, raw_user_meta_data->>'first_name', raw_user_meta_data->>'last_name'
  INTO v_user_email, v_first_name, v_last_name
  FROM auth.users WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found in the global registry.';
  END IF;

  INSERT INTO public.clients (user_id, email, first_name, last_name, organization_id)
  VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id);
END;
$$;


ALTER FUNCTION "public"."add_client_to_organization"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_client_id        uuid;
  v_new_tc_id        uuid;
  v_last_tc          record;
  v_pick_up          boolean := false;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.profiles p ON p.organization_id = t.organization_id
    WHERE t.id = p_trip_id
      AND p.id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'permission denied: you do not have access to this trip';
  END IF;

  FOREACH v_client_id IN ARRAY p_client_ids LOOP

    -- 1. Insert (unique constraint will raise 23505 if already on trip)
    INSERT INTO trip_clients (trip_id, client_id)
    VALUES (p_trip_id, v_client_id)
    RETURNING id INTO v_new_tc_id;

    -- 2. Most recent prior trip → equipment defaults
    SELECT tc.bcd, tc.wetsuit, tc.fins, tc.mask,
           tc.regulator, tc.computer,
           tc.nitrox1, tc.nitrox_percentage1,
           tc.nitrox2, tc.nitrox_percentage2,
           tc.weights, tc.private
    INTO v_last_tc
    FROM trip_clients tc
    JOIN trips t ON t.id = tc.trip_id
    WHERE tc.client_id = v_client_id
      AND tc.trip_id  != p_trip_id
      AND t.start_time::date < p_trip_date
    ORDER BY t.start_time DESC
    LIMIT 1;

    -- 3. pick_up → true if any same-visit trip already has it
    SELECT EXISTS (
      SELECT 1
      FROM trip_clients tc
      JOIN trips        t  ON t.id  = tc.trip_id
      JOIN visit_clients vc ON vc.client_id = v_client_id
      JOIN visits        v  ON v.id = vc.visit_id
      WHERE tc.client_id = v_client_id
        AND tc.trip_id  != p_trip_id
        AND tc.pick_up   = true
        AND t.start_time::date BETWEEN v.start_date AND v.end_date
        AND v.start_date <= p_trip_date
        AND v.end_date   >= p_trip_date
    ) INTO v_pick_up;

    -- 4. Apply pre-fill to the newly created row
    UPDATE trip_clients SET
      bcd                = COALESCE(v_last_tc.bcd,                bcd),
      wetsuit            = COALESCE(v_last_tc.wetsuit,            wetsuit),
      fins               = COALESCE(v_last_tc.fins,               fins),
      mask               = COALESCE(v_last_tc.mask,               mask),
      regulator          = COALESCE(v_last_tc.regulator,          regulator),
      computer           = COALESCE(v_last_tc.computer,           computer),
      nitrox1            = COALESCE(v_last_tc.nitrox1,            nitrox1),
      nitrox_percentage1 = COALESCE(v_last_tc.nitrox_percentage1, nitrox_percentage1),
      nitrox2            = COALESCE(v_last_tc.nitrox2,            nitrox2),
      nitrox_percentage2 = COALESCE(v_last_tc.nitrox_percentage2, nitrox_percentage2),
      weights            = COALESCE(v_last_tc.weights,            weights),
      private            = COALESCE(v_last_tc.private,            false),
      pick_up            = v_pick_up
    WHERE id = v_new_tc_id;

  END LOOP;
END;
$$;


ALTER FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_trip_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."check_trip_capacity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_vessel_overlap"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Skip the check when no vessel is assigned
  IF NEW.vessel_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM   public.trips
    WHERE  vessel_id        = NEW.vessel_id
      AND  id              != NEW.id   -- exclude the row itself (safe for INSERT too,
                                       -- because the new uuid doesn't exist yet)
      AND  start_time       < NEW.start_time + (NEW.duration_minutes * INTERVAL '1 minute')
      AND  start_time + (duration_minutes * INTERVAL '1 minute') > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'vessel_overlap: vessel % is already assigned to another trip during this time window',
      NEW.vessel_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_vessel_overlap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_trip_series"("p_org_id" "uuid", "p_label" "text", "p_trip_type_id" "uuid", "p_entry_mode" "text", "p_duration_mins" integer, "p_max_divers" integer, "p_vessel_id" "uuid", "p_start_times" timestamp with time zone[]) RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."create_trip_series"("p_org_id" "uuid", "p_label" "text", "p_trip_type_id" "uuid", "p_entry_mode" "text", "p_duration_mins" integer, "p_max_divers" integer, "p_vessel_id" "uuid", "p_start_times" timestamp with time zone[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."elevate_user_to_staff"("p_user_id" "uuid", "p_target_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_org_id uuid;
  v_admin_role text;
  v_user_email text;
  v_first_name text;
  v_last_name text;
  v_user_org_id uuid;
BEGIN
  SELECT organization_id, role::text INTO v_org_id, v_admin_role
  FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_admin_role, '') != 'admin' THEN
    RAISE EXCEPTION 'unauthorized: only admins can elevate staff';
  END IF;
  
  IF p_target_role NOT IN ('client', 'staff_1', 'staff_2', 'admin') THEN
    RAISE EXCEPTION 'invalid role type';
  END IF;

  -- Cross-Tenant Hijack Guard
  SELECT organization_id INTO v_user_org_id
  FROM public.profiles WHERE id = p_user_id;

  IF v_user_org_id IS NOT NULL AND v_user_org_id != v_org_id THEN
    RAISE EXCEPTION 'User is currently employed by another dive organization and cannot be escalated. They can only be added as a local Client.';
  END IF;

  SELECT email, raw_user_meta_data->>'first_name', raw_user_meta_data->>'last_name'
  INTO v_user_email, v_first_name, v_last_name
  FROM auth.users WHERE id = p_user_id;

  -- Bypass trigger
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- Update Role & Lock OR Free them if demoted to Client
  UPDATE public.profiles
  SET 
    role = p_target_role::public.user_role,
    organization_id = CASE WHEN p_target_role = 'client' THEN NULL ELSE v_org_id END
  WHERE id = p_user_id;

  -- Scaffold local client container if missing
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE user_id = p_user_id AND organization_id = v_org_id) THEN
    INSERT INTO public.clients (user_id, email, first_name, last_name, organization_id)
    VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id);
  END IF;

  -- Assign to local Staff roster
  IF p_target_role IN ('staff_1', 'staff_2', 'admin') THEN
    INSERT INTO public.staff (user_id, email, first_name, last_name, organization_id)
    VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id)
    ON CONFLICT (email) DO NOTHING;
  END IF;

END;
$$;


ALTER FUNCTION "public"."elevate_user_to_staff"("p_user_id" "uuid", "p_target_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_alerts"("p_org_id" "uuid") RETURNS TABLE("alert_type" "text", "severity" "text", "trip_id" "uuid", "trip_start" timestamp with time zone, "trip_label" "text", "client_id" "uuid", "client_name" "text", "message" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

  -- missing_waiver: client has no waiver, trip starts within 2 days
  SELECT
    'missing_waiver'::text,
    'critical'::text,
    t.id,
    t.start_time,
    COALESCE(t.label, tt.name, 'Trip'),
    c.id,
    c.first_name || ' ' || c.last_name,
    'Missing waiver: ' || c.first_name || ' ' || c.last_name
  FROM public.trip_clients tc
  JOIN public.trips t       ON t.id  = tc.trip_id
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  JOIN public.clients c     ON c.id  = tc.client_id
  WHERE t.organization_id = p_org_id
    AND tc.waiver         = false
    AND t.start_time      > now()
    AND t.start_time     <= now() + INTERVAL '2 days'
    -- Auth guard: caller must belong to this org
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND organization_id = p_org_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id      = p_org_id
        AND ar.alert_type  = 'missing_waiver'
        AND ar.trip_id     = t.id
        AND ar.client_id   = tc.client_id
    )

  UNION ALL

  -- missing_deposit: client has no deposit, trip starts within 7 days
  SELECT
    'missing_deposit'::text,
    'warning'::text,
    t.id,
    t.start_time,
    COALESCE(t.label, tt.name, 'Trip'),
    c.id,
    c.first_name || ' ' || c.last_name,
    'Missing deposit: ' || c.first_name || ' ' || c.last_name
  FROM public.trip_clients tc
  JOIN public.trips t       ON t.id  = tc.trip_id
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  JOIN public.clients c     ON c.id  = tc.client_id
  WHERE t.organization_id = p_org_id
    AND tc.deposit        = false
    AND t.start_time      > now()
    AND t.start_time     <= now() + INTERVAL '7 days'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND organization_id = p_org_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id      = p_org_id
        AND ar.alert_type  = 'missing_deposit'
        AND ar.trip_id     = t.id
        AND ar.client_id   = tc.client_id
    )

  UNION ALL

  -- no_staff: trip starts within 7 days and has no trip_staff entries
  SELECT
    'no_staff'::text,
    'critical'::text,
    t.id,
    t.start_time,
    COALESCE(t.label, tt.name, 'Trip'),
    NULL::uuid,
    NULL::text,
    'No staff assigned to trip'
  FROM public.trips t
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  WHERE t.organization_id = p_org_id
    AND t.start_time      > now()
    AND t.start_time     <= now() + INTERVAL '7 days'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND organization_id = p_org_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.trip_staff ts WHERE ts.trip_id = t.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id     = p_org_id
        AND ar.alert_type = 'no_staff'
        AND ar.trip_id    = t.id
    )

  ORDER BY 4 ASC, 1 ASC;  -- 4 = trip_start, 1 = alert_type

$$;


ALTER FUNCTION "public"."get_active_alerts"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_activity_logs"("p_org_id" "uuid", "p_entity_type" "text" DEFAULT NULL::"text", "p_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "action" "text", "entity_type" "text", "entity_id" "uuid", "metadata" "jsonb", "actor_name" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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
    -- Auth guard: caller must belong to this org
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND organization_id = p_org_id
    )
    AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND (p_from IS NULL OR al.created_at >= p_from)
    AND (p_to   IS NULL OR al.created_at <  p_to)
  ORDER BY al.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;


ALTER FUNCTION "public"."get_activity_logs"("p_org_id" "uuid", "p_entity_type" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_global_passport"("p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_caller_role text;
  v_passport json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.role::text INTO v_caller_role FROM public.profiles p WHERE p.id = auth.uid();
  
  IF v_caller_role NOT IN ('staff_1', 'staff_2', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Insufficient privileges';
  END IF;

  -- Crucial fix: We dynamically weave the first_name and last_name securely from auth.users (u)
  SELECT json_build_object(
    'id', p.id,
    'email', u.email,
    'first_name', u.raw_user_meta_data->>'first_name',
    'last_name', u.raw_user_meta_data->>'last_name',
    'phone', p.phone,
    'address_street', p.address_street,
    'address_city', p.address_city,
    'address_zip', p.address_zip,
    'address_country', p.address_country,
    'emergency_contact_name', p.emergency_contact_name,
    'emergency_contact_phone', p.emergency_contact_phone,
    'cert_organization', p.cert_organization,
    'cert_level', p.cert_level,
    'cert_level_name', cl.name,
    'cert_level_abbr', cl.abbreviation,
    'cert_number', p.cert_number,
    'nitrox_cert_number', p.nitrox_cert_number,
    'last_dive_date', p.last_dive_date,
    'role', p.role,
    'organization_id', p.organization_id
  ) INTO v_passport
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.certification_levels cl ON p.cert_level = cl.id
  WHERE p.id = p_user_id;

  RETURN v_passport;
END;
$$;


ALTER FUNCTION "public"."get_global_passport"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_overview_trips"("p_org_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("id" "uuid", "label" "text", "start_time" timestamp with time zone, "max_divers" integer, "entry_mode" "text", "vessel_id" "uuid", "vessel_name" "text", "vessel_abbreviation" "text", "trip_type_name" "text", "trip_type_abbreviation" "text", "trip_type_color" "text", "trip_type_category" "text", "trip_type_number_of_dives" integer, "booked_divers" bigint, "activity_counts" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."get_overview_trips"("p_org_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'client');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_client_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."log_client_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_staff_job_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."log_staff_job_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_trip_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."log_trip_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_trip_client_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."log_trip_client_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."my_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_profile_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'permission denied: role changes must go through the admin API';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'permission denied: organization changes must go through the admin API';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_profile_escalation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean DEFAULT NULL::boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_visit_start date;
  v_visit_end   date;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.profiles p ON p.organization_id = t.organization_id
    WHERE t.id = p_current_trip_id
      AND p.id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'permission denied: you do not have access to this trip';
  END IF;

  -- Resolve the visit covering this trip date (for pick_up scoping)
  SELECT v.start_date, v.end_date
  INTO v_visit_start, v_visit_end
  FROM visit_clients vc
  JOIN visits v ON v.id = vc.visit_id
  WHERE vc.client_id = p_client_id
    AND v.start_date <= p_trip_date::date
    AND v.end_date   >= p_trip_date::date
  LIMIT 1;

  -- Equipment → all future trip_client rows for this client
  IF p_equipment IS NOT NULL AND p_equipment != '{}'::jsonb THEN
    UPDATE trip_clients tc SET
      bcd                = CASE WHEN p_equipment ? 'bcd'                THEN  p_equipment->>'bcd'                                        ELSE bcd                END,
      wetsuit            = CASE WHEN p_equipment ? 'wetsuit'            THEN  p_equipment->>'wetsuit'                                    ELSE wetsuit            END,
      fins               = CASE WHEN p_equipment ? 'fins'               THEN  p_equipment->>'fins'                                       ELSE fins               END,
      mask               = CASE WHEN p_equipment ? 'mask'               THEN  p_equipment->>'mask'                                       ELSE mask               END,
      regulator          = CASE WHEN p_equipment ? 'regulator'          THEN (p_equipment->>'regulator')::boolean                        ELSE regulator          END,
      computer           = CASE WHEN p_equipment ? 'computer'           THEN (p_equipment->>'computer')::boolean                         ELSE computer           END,
      nitrox1            = CASE WHEN p_equipment ? 'nitrox1'            THEN (p_equipment->>'nitrox1')::boolean                          ELSE nitrox1            END,
      nitrox_percentage1 = CASE WHEN p_equipment ? 'nitrox_percentage1' THEN (p_equipment->>'nitrox_percentage1')::integer               ELSE nitrox_percentage1 END,
      nitrox2            = CASE WHEN p_equipment ? 'nitrox2'            THEN (p_equipment->>'nitrox2')::boolean                          ELSE nitrox2            END,
      nitrox_percentage2 = CASE WHEN p_equipment ? 'nitrox_percentage2' THEN (p_equipment->>'nitrox_percentage2')::integer               ELSE nitrox_percentage2 END,
      weights            = CASE WHEN p_equipment ? 'weights'            THEN  p_equipment->>'weights'                                    ELSE weights            END,
      private            = CASE WHEN p_equipment ? 'private'            THEN (p_equipment->>'private')::boolean                         ELSE private            END
    FROM trips t
    WHERE tc.trip_id        = t.id
      AND tc.client_id      = p_client_id
      AND tc.trip_id       != p_current_trip_id
      AND t.start_time      >= p_trip_date::timestamptz;
  END IF;

  -- pick_up → same-visit future trips only
  IF p_pick_up IS NOT NULL AND v_visit_start IS NOT NULL THEN
    UPDATE trip_clients tc
    SET pick_up = p_pick_up
    FROM trips t
    WHERE tc.trip_id   = t.id
      AND tc.client_id = p_client_id
      AND tc.trip_id  != p_current_trip_id
      AND t.start_time >= p_trip_date::timestamptz
      AND t.start_time::date BETWEEN v_visit_start AND v_visit_end;
  END IF;

END;
$$;


ALTER FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_global_identities"("p_query" "text") RETURNS TABLE("id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "role" "text", "created_at" timestamp with time zone, "organization_id" "uuid", "is_local_client" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_org_id uuid;
  v_admin_role text;
BEGIN
  -- Verify the administrator
  SELECT p.organization_id, p.role::text INTO v_org_id, v_admin_role
  FROM public.profiles p WHERE p.id = auth.uid();

  IF COALESCE(v_admin_role, '') != 'admin' THEN
    RAISE EXCEPTION 'unauthorized: lacking admin privileges';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    u.email::text,
    (u.raw_user_meta_data->>'first_name')::text AS first_name,
    (u.raw_user_meta_data->>'last_name')::text AS last_name,
    p.role::text,
    p.created_at,
    p.organization_id,
    (c.id IS NOT NULL) AS is_local_client
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.clients c ON c.user_id = u.id AND c.organization_id = v_org_id
  WHERE 
    ((p_query IS NULL OR length(trim(p_query)) < 3) 
     AND (p.organization_id = v_org_id OR c.id IS NOT NULL))
    OR 
    (length(trim(p_query)) >= 3 
     AND (
       u.email ILIKE '%' || p_query || '%' OR
       (u.raw_user_meta_data->>'first_name') ILIKE '%' || p_query || '%' OR
       (u.raw_user_meta_data->>'last_name') ILIKE '%' || p_query || '%'
     ))
  ORDER BY 
    (p.organization_id = v_org_id OR c.id IS NOT NULL) DESC,
    p.created_at DESC
  LIMIT 50;
END;
$$;


ALTER FUNCTION "public"."search_global_identities"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "accept_certified_divers" boolean,
    "abbreviation" "text",
    "category" "text",
    "course" "uuid"
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_auth_uid" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."activity_logs" IS 'Audit log of admin-visible actions across trips, clients, and staff.';



CREATE TABLE IF NOT EXISTS "public"."alert_resolutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "alert_type" "text" NOT NULL,
    "trip_id" "uuid",
    "client_id" "uuid",
    "resolved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_by" "uuid",
    "notes" "text"
);


ALTER TABLE "public"."alert_resolutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bulk_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "size" "text",
    "quantity" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bulk_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."certification_levels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "abbreviation" "text" NOT NULL,
    "name" "text",
    "is_professional" boolean DEFAULT false
);


ALTER TABLE "public"."certification_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."certification_organizations" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."certification_organizations" OWNER TO "postgres";


ALTER TABLE "public"."certification_organizations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."certification_organizations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."client_dive_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_dive_id" "uuid" NOT NULL,
    "trip_client_id" "uuid" NOT NULL,
    "max_depth" numeric(5,1),
    "bottom_time" smallint
);


ALTER TABLE "public"."client_dive_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "cert_number" "text",
    "cert_level" "uuid",
    "cert_organization" "text",
    "nitrox_cert_number" "text",
    "last_dive_date" "date",
    "address_street" "text",
    "address_city" "text",
    "address_zip" "text",
    "address_country" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "client_number" bigint NOT NULL
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


ALTER TABLE "public"."clients" ALTER COLUMN "client_number" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."clients_client_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "duration_days" integer,
    "min_age" integer,
    "prerequisites" "text",
    "description" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "Ratio" integer
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."divesites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "max_depth" numeric(5,1) NOT NULL,
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid"
);


ALTER TABLE "public"."divesites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sizes" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."equipment_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hotels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address_street" "text",
    "address_city" "text",
    "address_zip" "text",
    "address_country" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hotels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "brand" "text",
    "model" "text",
    "size" "text",
    "serial_number" "text",
    "condition" "public"."equipment_condition" DEFAULT 'Good'::"public"."equipment_condition" NOT NULL,
    "last_service_date" "date",
    "next_service_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid"
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "color" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."job_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "address_street" "text",
    "address_city" "text",
    "address_zip" "text",
    "address_country" "text",
    "entry_modes" "public"."entry_mode_type" DEFAULT 'Both'::"public"."entry_mode_type" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "website" "text",
    "logo_url" "text",
    "entry_modes" "public"."entry_mode_type" DEFAULT 'Both'::"public"."entry_mode_type" NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "unit_system" "text" DEFAULT 'metric'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "subscription_plan" "public"."subscription_plan_type" DEFAULT 'Basic'::"public"."subscription_plan_type" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organizations_unit_system_check" CHECK (("unit_system" = ANY (ARRAY['metric'::"text", 'imperial'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."user_role" DEFAULT 'client'::"public"."user_role" NOT NULL,
    "organization_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "phone" "text",
    "address_street" "text",
    "address_city" "text",
    "address_zip" "text",
    "address_country" "text",
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text",
    "cert_organization" "text",
    "cert_level" "uuid",
    "cert_number" "text",
    "nitrox_cert_number" "text",
    "last_dive_date" "date"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specialties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "agency" "text" NOT NULL
);


ALTER TABLE "public"."specialties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "certification_level_id" "uuid",
    "captain_license" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "initials" "text"
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_daily_job" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "job_type_id" "uuid" NOT NULL,
    "job_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "AM/PM" "text",
    "trip_id" "uuid",
    "activity_id" "uuid"
);


ALTER TABLE "public"."staff_daily_job" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_dive_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_dive_id" "uuid" NOT NULL,
    "trip_staff_id" "uuid" NOT NULL
);


ALTER TABLE "public"."staff_dive_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_specialties" (
    "staff_id" "uuid" NOT NULL,
    "specialty_id" "uuid" NOT NULL
);


ALTER TABLE "public"."staff_specialties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "nitrox1" boolean DEFAULT false,
    "nitrox_percentage1" integer,
    "course_id" "uuid",
    "notes" "text",
    "mask" "text",
    "fins" "text",
    "bcd" "text",
    "regulator" boolean DEFAULT false,
    "wetsuit" "text",
    "computer" boolean DEFAULT false,
    "pick_up" boolean DEFAULT false,
    "waiver" boolean DEFAULT false,
    "deposit" boolean DEFAULT false,
    "weights" "text",
    "nitrox2" boolean,
    "nitrox_percentage2" integer,
    "activity_id" "uuid",
    "private" boolean DEFAULT false NOT NULL,
    "tank1" "text",
    "tank2" "text",
    "nitrox3" boolean,
    "nitrox_percentage3" integer,
    "tank3" boolean,
    "staff_assgined" "uuid"
);


ALTER TABLE "public"."trip_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_dives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "divesite_id" "uuid" NOT NULL,
    "dive_number" smallint NOT NULL,
    "started_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trip_dives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "role_id" "uuid",
    "activity_id" "uuid"
);


ALTER TABLE "public"."trip_staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "default_start_time" time without time zone NOT NULL,
    "number_of_dives" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "abbreviation" "text",
    "color" "text" DEFAULT 'blue'::"text",
    "category" "text"
);


ALTER TABLE "public"."trip_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text",
    "entry_mode" "text",
    "start_time" timestamp with time zone NOT NULL,
    "duration_minutes" integer NOT NULL,
    "max_divers" integer NOT NULL,
    "dive_site_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "vessel_id" "uuid",
    "trip_type_id" "uuid",
    "series_id" "uuid"
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vessels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "name" "text" NOT NULL,
    "capacity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "abbreviation" "text",
    "need_captain" boolean
);


ALTER TABLE "public"."vessels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visit_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "room_number" "text",
    "arrival_time" timestamp with time zone,
    "departure_time" timestamp with time zone,
    "transfer_needed" boolean DEFAULT false,
    "notes" "text"
);


ALTER TABLE "public"."visit_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "hotel_id" "uuid",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."visits" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_resolutions"
    ADD CONSTRAINT "alert_resolutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulk_inventory"
    ADD CONSTRAINT "bulk_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certification_levels"
    ADD CONSTRAINT "certification_levels_abbreviation_key" UNIQUE ("abbreviation");



ALTER TABLE ONLY "public"."certification_levels"
    ADD CONSTRAINT "certification_levels_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."certification_levels"
    ADD CONSTRAINT "certification_levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certification_organizations"
    ADD CONSTRAINT "certification_organizations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."certification_organizations"
    ADD CONSTRAINT "certification_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_dive_logs"
    ADD CONSTRAINT "client_dive_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_dive_logs"
    ADD CONSTRAINT "client_dive_logs_unique" UNIQUE ("trip_dive_id", "trip_client_id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."divesites"
    ADD CONSTRAINT "dive_sites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_categories"
    ADD CONSTRAINT "equipment_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."equipment_categories"
    ADD CONSTRAINT "equipment_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotels"
    ADD CONSTRAINT "hotels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_types"
    ADD CONSTRAINT "job_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."specialties"
    ADD CONSTRAINT "specialties_name_agency_key" UNIQUE ("name", "agency");



ALTER TABLE ONLY "public"."specialties"
    ADD CONSTRAINT "specialties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_dive_logs"
    ADD CONSTRAINT "staff_dive_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_dive_logs"
    ADD CONSTRAINT "staff_dive_logs_unique" UNIQUE ("trip_dive_id", "trip_staff_id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_specialties"
    ADD CONSTRAINT "staff_specialties_pkey" PRIMARY KEY ("staff_id", "specialty_id");



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_trip_id_client_id_key" UNIQUE ("trip_id", "client_id");



ALTER TABLE ONLY "public"."trip_dives"
    ADD CONSTRAINT "trip_dives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_dives"
    ADD CONSTRAINT "trip_dives_unique_slot" UNIQUE ("trip_id", "dive_number");



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_types"
    ADD CONSTRAINT "trip_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vessels"
    ADD CONSTRAINT "vessels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_clients"
    ADD CONSTRAINT "visit_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_clients"
    ADD CONSTRAINT "visit_clients_visit_id_client_id_key" UNIQUE ("visit_id", "client_id");



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_pkey" PRIMARY KEY ("id");



CREATE INDEX "activity_logs_org_created" ON "public"."activity_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "activity_logs_org_type_created" ON "public"."activity_logs" USING "btree" ("organization_id", "entity_type", "created_at" DESC);



CREATE UNIQUE INDEX "bulk_inventory_org_category_size_idx" ON "public"."bulk_inventory" USING "btree" ("organization_id", "category_id", COALESCE("size", ''::"text"));



CREATE INDEX "idx_alert_resolutions_lookup" ON "public"."alert_resolutions" USING "btree" ("org_id", "alert_type", "trip_id", "client_id");



CREATE INDEX "idx_alert_resolutions_org" ON "public"."alert_resolutions" USING "btree" ("org_id");



CREATE INDEX "idx_bulk_inventory_category" ON "public"."bulk_inventory" USING "btree" ("category_id");



CREATE INDEX "idx_bulk_inventory_org" ON "public"."bulk_inventory" USING "btree" ("organization_id");



CREATE INDEX "idx_clients_country" ON "public"."clients" USING "btree" ("address_country");



CREATE INDEX "idx_clients_email" ON "public"."clients" USING "btree" ("email");



CREATE INDEX "idx_clients_location" ON "public"."clients" USING "btree" ("location_id");



CREATE INDEX "idx_clients_org" ON "public"."clients" USING "btree" ("organization_id");



CREATE INDEX "idx_clients_user_id" ON "public"."clients" USING "btree" ("user_id");



CREATE INDEX "idx_dive_sites_location" ON "public"."divesites" USING "btree" ("location_id");



CREATE INDEX "idx_dive_sites_org" ON "public"."divesites" USING "btree" ("organization_id");



CREATE INDEX "idx_hotels_organization" ON "public"."hotels" USING "btree" ("organization_id");



CREATE INDEX "idx_inventory_category" ON "public"."inventory" USING "btree" ("category_id");



CREATE INDEX "idx_inventory_condition" ON "public"."inventory" USING "btree" ("condition");



CREATE INDEX "idx_inventory_location" ON "public"."inventory" USING "btree" ("location_id");



CREATE INDEX "idx_inventory_org" ON "public"."inventory" USING "btree" ("organization_id");



CREATE INDEX "idx_job_types_org" ON "public"."job_types" USING "btree" ("organization_id", "sort_order");



CREATE INDEX "idx_locations_organization" ON "public"."locations" USING "btree" ("organization_id");



CREATE INDEX "idx_profiles_organization" ON "public"."profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_staff_daily_job_date" ON "public"."staff_daily_job" USING "btree" ("organization_id", "job_date");



CREATE INDEX "idx_staff_daily_job_trip" ON "public"."staff_daily_job" USING "btree" ("trip_id") WHERE ("trip_id" IS NOT NULL);



CREATE INDEX "idx_staff_email" ON "public"."staff" USING "btree" ("email");



CREATE INDEX "idx_staff_location" ON "public"."staff" USING "btree" ("location_id");



CREATE INDEX "idx_staff_org" ON "public"."staff" USING "btree" ("organization_id");



CREATE INDEX "idx_staff_specialties_specialty" ON "public"."staff_specialties" USING "btree" ("specialty_id");



CREATE INDEX "idx_staff_specialties_staff" ON "public"."staff_specialties" USING "btree" ("staff_id");



CREATE INDEX "idx_staff_user_id" ON "public"."staff" USING "btree" ("user_id");



CREATE INDEX "idx_trip_clients_client" ON "public"."trip_clients" USING "btree" ("client_id");



CREATE INDEX "idx_trip_clients_trip" ON "public"."trip_clients" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_staff_activity" ON "public"."trip_staff" USING "btree" ("trip_id", "activity_id");



CREATE INDEX "idx_trip_staff_staff" ON "public"."trip_staff" USING "btree" ("staff_id");



CREATE INDEX "idx_trip_staff_trip" ON "public"."trip_staff" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_types_organization" ON "public"."trip_types" USING "btree" ("organization_id");



CREATE INDEX "idx_trips_dive_site" ON "public"."trips" USING "btree" ("dive_site_id");



CREATE INDEX "idx_trips_location" ON "public"."trips" USING "btree" ("location_id");



CREATE INDEX "idx_trips_org" ON "public"."trips" USING "btree" ("organization_id");



CREATE INDEX "idx_trips_series" ON "public"."trips" USING "btree" ("series_id") WHERE ("series_id" IS NOT NULL);



CREATE INDEX "idx_trips_start_time" ON "public"."trips" USING "btree" ("start_time");



CREATE INDEX "idx_trips_trip_type" ON "public"."trips" USING "btree" ("trip_type_id");



CREATE INDEX "idx_trips_vessel" ON "public"."trips" USING "btree" ("vessel_id");



CREATE INDEX "idx_vessels_location" ON "public"."vessels" USING "btree" ("location_id");



CREATE INDEX "idx_vessels_organization" ON "public"."vessels" USING "btree" ("organization_id");



CREATE INDEX "idx_visit_clients_client" ON "public"."visit_clients" USING "btree" ("client_id");



CREATE INDEX "idx_visit_clients_visit" ON "public"."visit_clients" USING "btree" ("visit_id");



CREATE INDEX "idx_visits_hotel" ON "public"."visits" USING "btree" ("hotel_id");



CREATE INDEX "idx_visits_organization" ON "public"."visits" USING "btree" ("organization_id");



CREATE INDEX "idx_visits_start_date" ON "public"."visits" USING "btree" ("start_date");



CREATE UNIQUE INDEX "trip_staff_activity_unique" ON "public"."trip_staff" USING "btree" ("trip_id", "staff_id", "activity_id") WHERE ("activity_id" IS NOT NULL);



CREATE UNIQUE INDEX "trip_staff_generic_unique" ON "public"."trip_staff" USING "btree" ("trip_id", "staff_id") WHERE ("activity_id" IS NULL);



CREATE OR REPLACE TRIGGER "clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "courses_updated_at" BEFORE UPDATE ON "public"."courses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "dive_sites_updated_at" BEFORE UPDATE ON "public"."divesites" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "hotels_updated_at" BEFORE UPDATE ON "public"."hotels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "inventory_updated_at" BEFORE UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "locations_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "staff_updated_at" BEFORE UPDATE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_check_trip_capacity" BEFORE INSERT OR UPDATE ON "public"."trip_clients" FOR EACH ROW EXECUTE FUNCTION "public"."check_trip_capacity"();



CREATE OR REPLACE TRIGGER "trg_log_client" AFTER INSERT ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."log_client_insert"();



CREATE OR REPLACE TRIGGER "trg_log_staff_job" AFTER INSERT OR DELETE ON "public"."staff_daily_job" FOR EACH ROW EXECUTE FUNCTION "public"."log_staff_job_change"();



CREATE OR REPLACE TRIGGER "trg_log_trip" AFTER INSERT OR DELETE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."log_trip_change"();



CREATE OR REPLACE TRIGGER "trg_log_trip_client" AFTER INSERT OR DELETE ON "public"."trip_clients" FOR EACH ROW EXECUTE FUNCTION "public"."log_trip_client_change"();



CREATE OR REPLACE TRIGGER "trg_prevent_profile_escalation" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_profile_escalation"();



CREATE OR REPLACE TRIGGER "trip_types_updated_at" BEFORE UPDATE ON "public"."trip_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trips_updated_at" BEFORE UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trips_vessel_overlap_check" BEFORE INSERT OR UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."check_vessel_overlap"();



CREATE OR REPLACE TRIGGER "vessels_updated_at" BEFORE UPDATE ON "public"."vessels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "visits_updated_at" BEFORE UPDATE ON "public"."visits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_category_fkey" FOREIGN KEY ("category") REFERENCES "public"."categories"("name") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_resolutions"
    ADD CONSTRAINT "alert_resolutions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_resolutions"
    ADD CONSTRAINT "alert_resolutions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."alert_resolutions"
    ADD CONSTRAINT "alert_resolutions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulk_inventory"
    ADD CONSTRAINT "bulk_inventory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulk_inventory"
    ADD CONSTRAINT "bulk_inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_dive_logs"
    ADD CONSTRAINT "client_dive_logs_client_fk" FOREIGN KEY ("trip_client_id") REFERENCES "public"."trip_clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_dive_logs"
    ADD CONSTRAINT "client_dive_logs_dive_fk" FOREIGN KEY ("trip_dive_id") REFERENCES "public"."trip_dives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."divesites"
    ADD CONSTRAINT "dive_sites_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."divesites"
    ADD CONSTRAINT "dive_sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "fk_clients_cert_level" FOREIGN KEY ("cert_level") REFERENCES "public"."certification_levels"("id");



ALTER TABLE ONLY "public"."hotels"
    ADD CONSTRAINT "hotels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_types"
    ADD CONSTRAINT "job_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_cert_level_fkey" FOREIGN KEY ("cert_level") REFERENCES "public"."certification_levels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_certification_level_id_fkey" FOREIGN KEY ("certification_level_id") REFERENCES "public"."certification_levels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_job_type_id_fkey" FOREIGN KEY ("job_type_id") REFERENCES "public"."job_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_dive_logs"
    ADD CONSTRAINT "staff_dive_logs_dive_fk" FOREIGN KEY ("trip_dive_id") REFERENCES "public"."trip_dives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_dive_logs"
    ADD CONSTRAINT "staff_dive_logs_staff_fk" FOREIGN KEY ("trip_staff_id") REFERENCES "public"."trip_staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_specialties"
    ADD CONSTRAINT "staff_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_specialties"
    ADD CONSTRAINT "staff_specialties_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id");



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_dives"
    ADD CONSTRAINT "trip_dives_divesite_fk" FOREIGN KEY ("divesite_id") REFERENCES "public"."divesites"("id");



ALTER TABLE ONLY "public"."trip_dives"
    ADD CONSTRAINT "trip_dives_trip_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_types"
    ADD CONSTRAINT "trip_types_category_fkey" FOREIGN KEY ("category") REFERENCES "public"."categories"("name") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."trip_types"
    ADD CONSTRAINT "trip_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_dive_site_id_fkey" FOREIGN KEY ("dive_site_id") REFERENCES "public"."divesites"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_trip_type_id_fkey" FOREIGN KEY ("trip_type_id") REFERENCES "public"."trip_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_vessel_id_fkey" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vessels"
    ADD CONSTRAINT "vessels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vessels"
    ADD CONSTRAINT "vessels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_clients"
    ADD CONSTRAINT "visit_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_clients"
    ADD CONSTRAINT "visit_clients_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



CREATE POLICY "Enable read/write for users based on organization_id" ON "public"."bulk_inventory" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_logs: select" ON "public"."activity_logs" FOR SELECT USING (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."alert_resolutions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alert_resolutions: delete" ON "public"."alert_resolutions" FOR DELETE USING (("org_id" = "public"."my_org_id"()));



CREATE POLICY "alert_resolutions: insert" ON "public"."alert_resolutions" FOR INSERT WITH CHECK (("org_id" = "public"."my_org_id"()));



CREATE POLICY "alert_resolutions: select" ON "public"."alert_resolutions" FOR SELECT USING (("org_id" = "public"."my_org_id"()));



ALTER TABLE "public"."bulk_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."certification_levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."certification_organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_dive_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_dive_logs: org members" ON "public"."client_dive_logs" USING ((EXISTS ( SELECT 1
   FROM ("public"."trip_dives" "td"
     JOIN "public"."trips" "t" ON (("t"."id" = "td"."trip_id")))
  WHERE (("td"."id" = "client_dive_logs"."trip_dive_id") AND ("t"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."trip_dives" "td"
     JOIN "public"."trips" "t" ON (("t"."id" = "td"."trip_id")))
  WHERE (("td"."id" = "client_dive_logs"."trip_dive_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients: delete" ON "public"."clients" FOR DELETE USING (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "clients: insert" ON "public"."clients" FOR INSERT WITH CHECK (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "clients: select" ON "public"."clients" FOR SELECT USING ((("organization_id" = "public"."my_org_id"()) OR (("user_id" IS NOT NULL) AND ("public"."my_org_id"() IS NOT NULL)) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "clients: update by staff" ON "public"."clients" FOR UPDATE USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "clients: update own" ON "public"."clients" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."divesites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "divesites: org members" ON "public"."divesites" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."equipment_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hotels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hotels: org members" ON "public"."hotels" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory: org members" ON "public"."inventory" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."job_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_types: select" ON "public"."job_types" FOR SELECT USING ((("organization_id" IS NULL) OR ("organization_id" = "public"."my_org_id"())));



CREATE POLICY "job_types: write" ON "public"."job_types" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations: org members" ON "public"."locations" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations: read own" ON "public"."organizations" FOR SELECT USING (("id" = "public"."my_org_id"()));



CREATE POLICY "organizations: update own" ON "public"."organizations" FOR UPDATE USING (("id" = "public"."my_org_id"())) WITH CHECK (("id" = "public"."my_org_id"()));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: read own" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles: read same org" ON "public"."profiles" FOR SELECT USING ((("public"."my_org_id"() IS NOT NULL) AND ("organization_id" = "public"."my_org_id"())));



CREATE POLICY "ref: select activities" ON "public"."activities" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select categories" ON "public"."categories" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select certification_levels" ON "public"."certification_levels" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select certification_organizations" ON "public"."certification_organizations" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select courses" ON "public"."courses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select equipment_categories" ON "public"."equipment_categories" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select roles" ON "public"."roles" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select specialties" ON "public"."specialties" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."specialties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff: org members" ON "public"."staff" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."staff_daily_job" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_daily_job: org members" ON "public"."staff_daily_job" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."staff_dive_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_dive_logs: org members" ON "public"."staff_dive_logs" USING ((EXISTS ( SELECT 1
   FROM ("public"."trip_dives" "td"
     JOIN "public"."trips" "t" ON (("t"."id" = "td"."trip_id")))
  WHERE (("td"."id" = "staff_dive_logs"."trip_dive_id") AND ("t"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."trip_dives" "td"
     JOIN "public"."trips" "t" ON (("t"."id" = "td"."trip_id")))
  WHERE (("td"."id" = "staff_dive_logs"."trip_dive_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."staff_specialties" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_specialties: org members" ON "public"."staff_specialties" USING ((EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("s"."id" = "staff_specialties"."staff_id") AND ("s"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("s"."id" = "staff_specialties"."staff_id") AND ("s"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."trip_clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_clients: delete" ON "public"."trip_clients" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_clients"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "trip_clients: insert" ON "public"."trip_clients" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_clients"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "trip_clients: select" ON "public"."trip_clients" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_clients"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))) OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."user_id" = "auth"."uid"())))));



CREATE POLICY "trip_clients: update" ON "public"."trip_clients" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_clients"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_clients"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."trip_dives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_dives: org members" ON "public"."trip_dives" USING ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_dives"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_dives"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."trip_staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_staff: org members" ON "public"."trip_staff" USING ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_staff"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_staff"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."trip_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_types: org members" ON "public"."trip_types" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trips: org members" ON "public"."trips" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."vessels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vessels: org members" ON "public"."vessels" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."visit_clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visit_clients: delete" ON "public"."visit_clients" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "visit_clients"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "visit_clients: insert" ON "public"."visit_clients" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "visit_clients"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "visit_clients: select" ON "public"."visit_clients" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "visit_clients"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"())))) OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."user_id" = "auth"."uid"())))));



CREATE POLICY "visit_clients: update" ON "public"."visit_clients" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "visit_clients"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "visit_clients"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."visits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visits: org members" ON "public"."visits" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_client_to_organization"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_client_to_organization"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_client_to_organization"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_trip_capacity"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_trip_capacity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_trip_capacity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_vessel_overlap"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_vessel_overlap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_vessel_overlap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_trip_series"("p_org_id" "uuid", "p_label" "text", "p_trip_type_id" "uuid", "p_entry_mode" "text", "p_duration_mins" integer, "p_max_divers" integer, "p_vessel_id" "uuid", "p_start_times" timestamp with time zone[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_trip_series"("p_org_id" "uuid", "p_label" "text", "p_trip_type_id" "uuid", "p_entry_mode" "text", "p_duration_mins" integer, "p_max_divers" integer, "p_vessel_id" "uuid", "p_start_times" timestamp with time zone[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_trip_series"("p_org_id" "uuid", "p_label" "text", "p_trip_type_id" "uuid", "p_entry_mode" "text", "p_duration_mins" integer, "p_max_divers" integer, "p_vessel_id" "uuid", "p_start_times" timestamp with time zone[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."elevate_user_to_staff"("p_user_id" "uuid", "p_target_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."elevate_user_to_staff"("p_user_id" "uuid", "p_target_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."elevate_user_to_staff"("p_user_id" "uuid", "p_target_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_alerts"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_alerts"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_alerts"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_activity_logs"("p_org_id" "uuid", "p_entity_type" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_activity_logs"("p_org_id" "uuid", "p_entity_type" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_activity_logs"("p_org_id" "uuid", "p_entity_type" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_global_passport"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_passport"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_passport"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_overview_trips"("p_org_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_overview_trips"("p_org_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_overview_trips"("p_org_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_client_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_client_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_client_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_staff_job_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_staff_job_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_staff_job_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_trip_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_trip_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_trip_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_trip_client_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_trip_client_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_trip_client_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_profile_escalation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_profile_escalation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_profile_escalation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_global_identities"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_global_identities"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_global_identities"("p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."alert_resolutions" TO "anon";
GRANT ALL ON TABLE "public"."alert_resolutions" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_resolutions" TO "service_role";



GRANT ALL ON TABLE "public"."bulk_inventory" TO "anon";
GRANT ALL ON TABLE "public"."bulk_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."bulk_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."certification_levels" TO "anon";
GRANT ALL ON TABLE "public"."certification_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."certification_levels" TO "service_role";



GRANT ALL ON TABLE "public"."certification_organizations" TO "anon";
GRANT ALL ON TABLE "public"."certification_organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."certification_organizations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."certification_organizations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."certification_organizations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."certification_organizations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."client_dive_logs" TO "anon";
GRANT ALL ON TABLE "public"."client_dive_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."client_dive_logs" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clients_client_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clients_client_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clients_client_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."divesites" TO "anon";
GRANT ALL ON TABLE "public"."divesites" TO "authenticated";
GRANT ALL ON TABLE "public"."divesites" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_categories" TO "anon";
GRANT ALL ON TABLE "public"."equipment_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_categories" TO "service_role";



GRANT ALL ON TABLE "public"."hotels" TO "anon";
GRANT ALL ON TABLE "public"."hotels" TO "authenticated";
GRANT ALL ON TABLE "public"."hotels" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."job_types" TO "anon";
GRANT ALL ON TABLE "public"."job_types" TO "authenticated";
GRANT ALL ON TABLE "public"."job_types" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."specialties" TO "anon";
GRANT ALL ON TABLE "public"."specialties" TO "authenticated";
GRANT ALL ON TABLE "public"."specialties" TO "service_role";



GRANT ALL ON TABLE "public"."staff" TO "anon";
GRANT ALL ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON TABLE "public"."staff_daily_job" TO "anon";
GRANT ALL ON TABLE "public"."staff_daily_job" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_daily_job" TO "service_role";



GRANT ALL ON TABLE "public"."staff_dive_logs" TO "anon";
GRANT ALL ON TABLE "public"."staff_dive_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_dive_logs" TO "service_role";



GRANT ALL ON TABLE "public"."staff_specialties" TO "anon";
GRANT ALL ON TABLE "public"."staff_specialties" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_specialties" TO "service_role";



GRANT ALL ON TABLE "public"."trip_clients" TO "anon";
GRANT ALL ON TABLE "public"."trip_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_clients" TO "service_role";



GRANT ALL ON TABLE "public"."trip_dives" TO "anon";
GRANT ALL ON TABLE "public"."trip_dives" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_dives" TO "service_role";



GRANT ALL ON TABLE "public"."trip_staff" TO "anon";
GRANT ALL ON TABLE "public"."trip_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_staff" TO "service_role";



GRANT ALL ON TABLE "public"."trip_types" TO "anon";
GRANT ALL ON TABLE "public"."trip_types" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_types" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON TABLE "public"."vessels" TO "anon";
GRANT ALL ON TABLE "public"."vessels" TO "authenticated";
GRANT ALL ON TABLE "public"."vessels" TO "service_role";



GRANT ALL ON TABLE "public"."visit_clients" TO "anon";
GRANT ALL ON TABLE "public"."visit_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."visit_clients" TO "service_role";



GRANT ALL ON TABLE "public"."visits" TO "anon";
GRANT ALL ON TABLE "public"."visits" TO "authenticated";
GRANT ALL ON TABLE "public"."visits" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







