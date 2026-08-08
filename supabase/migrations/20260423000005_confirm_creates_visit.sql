-- Update confirm_booking_hold to also create a visit for the booking group.
-- All guests in one booking share a single visit covering the trip date.
CREATE OR REPLACE FUNCTION public.confirm_booking_hold(p_hold_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_booking    public.online_bookings;
  v_guest      jsonb;
  v_name       text;
  v_email      text;
  v_first      text;
  v_last       text;
  v_client_id  uuid;
  v_visit_id   uuid;
  v_trip_date  date;
BEGIN
  SELECT * INTO v_booking
  FROM   public.online_bookings
  WHERE  id = p_hold_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Hold not found');
  END IF;

  IF v_booking.status != 'held' THEN
    RETURN jsonb_build_object('error', 'Hold is not active', 'status', v_booking.status);
  END IF;

  IF v_booking.hold_expires_at < now() THEN
    UPDATE public.online_bookings SET status = 'expired' WHERE id = p_hold_id;
    RETURN jsonb_build_object('error', 'Hold has expired');
  END IF;

  -- Confirm the booking
  UPDATE public.online_bookings
  SET    status = 'confirmed', hold_expires_at = NULL
  WHERE  id = p_hold_id;

  -- Derive the trip date (date portion of start_time in UTC)
  SELECT start_time::date INTO v_trip_date
  FROM   public.trips
  WHERE  id = v_booking.trip_id;

  -- Create one visit for the whole group covering the trip date
  INSERT INTO public.visits (organization_id, start_date, end_date)
  VALUES (v_booking.organization_id, v_trip_date, v_trip_date)
  RETURNING id INTO v_visit_id;

  -- Process each guest
  FOR v_guest IN SELECT * FROM jsonb_array_elements(v_booking.guests)
  LOOP
    v_name  := trim(v_guest->>'name');
    v_email := nullif(trim(v_guest->>'email'), '');

    -- Split name: first word → first_name, rest → last_name
    v_first := split_part(v_name, ' ', 1);
    v_last  := trim(substring(v_name from length(split_part(v_name, ' ', 1)) + 2));

    -- Match by email within the org to avoid duplicates
    v_client_id := NULL;
    IF v_email IS NOT NULL THEN
      SELECT id INTO v_client_id
      FROM   public.clients
      WHERE  organization_id = v_booking.organization_id
        AND  lower(email) = lower(v_email)
      LIMIT 1;
    END IF;

    -- Create new client if no match found
    IF v_client_id IS NULL THEN
      INSERT INTO public.clients (
        organization_id,
        first_name,
        last_name,
        email,
        phone
      ) VALUES (
        v_booking.organization_id,
        v_first,
        v_last,
        v_email,
        CASE WHEN v_guest = v_booking.guests->0 THEN v_booking.lead_phone ELSE NULL END
      )
      RETURNING id INTO v_client_id;
    END IF;

    -- Add client to the visit
    INSERT INTO public.visit_clients (visit_id, client_id)
    VALUES (v_visit_id, v_client_id)
    ON CONFLICT (visit_id, client_id) DO NOTHING;

    -- Add client to the trip manifest
    INSERT INTO public.trip_clients (trip_id, client_id)
    VALUES (v_booking.trip_id, v_client_id)
    ON CONFLICT DO NOTHING;

  END LOOP;

  RETURN jsonb_build_object('booking_id', p_hold_id, 'visit_id', v_visit_id);
END;
$$;
