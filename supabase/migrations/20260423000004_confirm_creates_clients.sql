-- Update confirm_booking_hold to create client profiles and add them to
-- trip_clients when a booking is confirmed. Uses email matching to avoid
-- creating duplicate clients for returning guests.
CREATE OR REPLACE FUNCTION public.confirm_booking_hold(p_hold_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_booking  public.online_bookings;
  v_guest    jsonb;
  v_name     text;
  v_email    text;
  v_first    text;
  v_last     text;
  v_client_id uuid;
  v_space    integer;
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

  -- Verify space is still available (guard against edge cases)
  v_space := public.get_trip_available_spaces(v_booking.trip_id);
  -- Subtract this hold's own pax since it's still 'held' and counted
  IF (v_space + v_booking.pax_count) < v_booking.pax_count THEN
    RETURN jsonb_build_object('error', 'Trip is now full');
  END IF;

  -- Confirm the booking first so get_trip_available_spaces counts it correctly
  UPDATE public.online_bookings
  SET    status = 'confirmed', hold_expires_at = NULL
  WHERE  id = p_hold_id;

  -- Create client profiles and add to trip_clients
  FOR v_guest IN SELECT * FROM jsonb_array_elements(v_booking.guests)
  LOOP
    v_name  := trim(v_guest->>'name');
    v_email := nullif(trim(v_guest->>'email'), '');

    -- Split name: first word → first_name, rest → last_name
    v_first := split_part(v_name, ' ', 1);
    v_last  := trim(substring(v_name from length(split_part(v_name, ' ', 1)) + 2));
    IF v_last = '' THEN v_last := ''; END IF;

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
        -- Only the lead (first guest) gets the phone number
        CASE WHEN v_guest = v_booking.guests->0 THEN v_booking.lead_phone ELSE NULL END
      )
      RETURNING id INTO v_client_id;
    END IF;

    -- Add to trip manifest (skip if already on this trip)
    INSERT INTO public.trip_clients (trip_id, client_id)
    VALUES (v_booking.trip_id, v_client_id)
    ON CONFLICT DO NOTHING;

  END LOOP;

  RETURN jsonb_build_object('booking_id', p_hold_id);
END;
$$;
