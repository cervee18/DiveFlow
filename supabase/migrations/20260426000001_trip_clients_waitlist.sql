-- Add waitlist support to trip_clients
-- Drop old 3-param signature so the new 4-param version is unambiguous
DROP FUNCTION IF EXISTS add_clients_to_trip(uuid, uuid[], date);

ALTER TABLE trip_clients
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('confirmed', 'waitlist'));

-- Capacity trigger: waitlist rows don't consume confirmed slots
CREATE OR REPLACE FUNCTION public.check_trip_capacity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_max_divers integer;
  v_booked     integer;
BEGIN
  IF NEW.status = 'waitlist' THEN
    RETURN NEW;
  END IF;

  SELECT max_divers INTO v_max_divers
  FROM public.trips WHERE id = NEW.trip_id;

  SELECT COUNT(*) INTO v_booked
  FROM public.trip_clients
  WHERE trip_id = NEW.trip_id
    AND status = 'confirmed'
    AND id IS DISTINCT FROM NEW.id;

  IF v_booked >= v_max_divers THEN
    RAISE EXCEPTION 'trip_capacity_exceeded: trip is full (% / %)', v_booked, v_max_divers
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- Update add_clients_to_trip to accept an optional status parameter
CREATE OR REPLACE FUNCTION add_clients_to_trip(
  p_trip_id    uuid,
  p_client_ids uuid[],
  p_trip_date  date,
  p_status     text DEFAULT 'confirmed'
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
    INSERT INTO trip_clients (trip_id, client_id, status)
    VALUES (p_trip_id, v_client_id, p_status)
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
