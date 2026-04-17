-- ============================================================
-- Migration: Auth guards for SECURITY DEFINER functions
-- Fixes audit finding C-4:
--   All four SECURITY DEFINER functions bypass RLS internally.
--   They were callable by unauthenticated users (anon) and did
--   not verify that the caller belongs to the target organization.
-- ============================================================


-- ─── get_active_alerts ───────────────────────────────────────────────────
--
-- Guard: p_org_id must match the caller's own organization_id.
-- Added as an EXISTS check in each WHERE clause (SQL function, no plpgsql).

CREATE OR REPLACE FUNCTION public.get_active_alerts(p_org_id uuid)
RETURNS TABLE (
  alert_type    text,
  severity      text,
  trip_id       uuid,
  trip_start    timestamptz,
  trip_label    text,
  client_id     uuid,
  client_name   text,
  message       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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


-- ─── get_activity_logs ───────────────────────────────────────────────────
--
-- Guard: p_org_id must match the caller's own organization_id.

CREATE OR REPLACE FUNCTION public.get_activity_logs(
  p_org_id      uuid,
  p_entity_type text        DEFAULT NULL,
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
SET search_path = public
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


-- ─── add_clients_to_trip ─────────────────────────────────────────────────
--
-- Guard: caller must be authenticated AND belong to the trip's org.

CREATE OR REPLACE FUNCTION public.add_clients_to_trip(
  p_trip_id    uuid,
  p_client_ids uuid[],
  p_trip_date  date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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


-- ─── propagate_trip_client_changes ───────────────────────────────────────
--
-- Guard: caller must be authenticated AND belong to the trip's org.

CREATE OR REPLACE FUNCTION public.propagate_trip_client_changes(
  p_client_id       uuid,
  p_current_trip_id uuid,
  p_trip_date       text,
  p_equipment       jsonb,
  p_pick_up         boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
