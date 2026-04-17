-- ============================================================
-- add_clients_to_trip
-- Inserts one or more clients onto a trip, then pre-fills each
-- new row with equipment from their most recent prior trip and
-- pick_up from any other trip within the same visit.
-- ============================================================
CREATE OR REPLACE FUNCTION add_clients_to_trip(
  p_trip_id   uuid,
  p_client_ids uuid[],
  p_trip_date date          -- YYYY-MM-DD of the target trip
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id        uuid;
  v_new_tc_id        uuid;
  v_last_tc          record;
  v_pick_up          boolean := false;
BEGIN
  FOREACH v_client_id IN ARRAY p_client_ids LOOP

    -- 0. Reject if client requires a visit and none covers this trip date (ERRCODE 23001)
    IF (SELECT requires_visit FROM clients WHERE id = v_client_id) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM visit_clients vc
        JOIN visits v ON v.id = vc.visit_id
        WHERE vc.client_id = v_client_id
          AND v.start_date <= p_trip_date
          AND v.end_date   >= p_trip_date
      ) THEN
        RAISE EXCEPTION 'Client requires an active visit covering % to be added to a trip. Create a visit first, or mark the client as a local resident.', p_trip_date
          USING ERRCODE = '23001';
      END IF;
    END IF;

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


-- ============================================================
-- propagate_trip_client_changes
-- Applies equipment changes to ALL future trip_client rows for
-- a client, and pick_up changes only to rows within the same
-- visit as the current trip.
-- ============================================================
CREATE OR REPLACE FUNCTION propagate_trip_client_changes(
  p_client_id       uuid,
  p_current_trip_id uuid,
  p_trip_date       text,    -- ISO timestamp of the current trip (start_time)
  p_equipment       jsonb,   -- equipment fields to propagate (omit pick_up)
  p_pick_up         boolean DEFAULT NULL  -- NULL = don't touch pick_up
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_visit_start date;
  v_visit_end   date;
BEGIN
  -- Resolve the visit covering this trip date (for pick_up scoping)
  SELECT v.start_date, v.end_date
  INTO v_visit_start, v_visit_end
  FROM visit_clients vc
  JOIN visits v ON v.id = vc.visit_id
  WHERE vc.client_id = p_client_id
    AND v.start_date <= p_trip_date::date
    AND v.end_date   >= p_trip_date::date
  LIMIT 1;

  -- Equipment → all future trip_client rows
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
