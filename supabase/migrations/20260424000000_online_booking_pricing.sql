-- Add per-person online price to trip_types (set per portal in management UI)
ALTER TABLE public.trip_types
  ADD COLUMN IF NOT EXISTS online_price_per_person numeric(10,2);

-- Store the price locked at hold creation time on the booking itself
ALTER TABLE public.online_bookings
  ADD COLUMN IF NOT EXISTS price_per_person numeric(10,2);

-- Update create_booking_hold to fetch and lock the price from the trip type
CREATE OR REPLACE FUNCTION public.create_booking_hold(
  p_trip_id    uuid,
  p_pax_count  integer,
  p_lead_name  text,
  p_lead_email text,
  p_lead_phone text,
  p_guests     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_available  integer;
  v_org_id     uuid;
  v_price      numeric(10,2);
  v_hold_id    uuid;
  v_expires_at timestamptz;
BEGIN
  SELECT public.get_trip_available_spaces(t.id), t.organization_id,
         tt.online_price_per_person
  INTO   v_available, v_org_id, v_price
  FROM   public.trips t
  JOIN   public.trip_types tt ON tt.id = t.trip_type_id
  WHERE  t.id = p_trip_id
  FOR UPDATE;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Trip not found');
  END IF;

  IF v_available < p_pax_count THEN
    RETURN jsonb_build_object('error', 'Not enough spaces available', 'available', v_available);
  END IF;

  v_expires_at := now() + interval '15 minutes';

  INSERT INTO public.online_bookings (
    organization_id, trip_id, status, hold_expires_at,
    lead_name, lead_email, lead_phone, pax_count, guests,
    price_per_person
  ) VALUES (
    v_org_id, p_trip_id, 'held', v_expires_at,
    p_lead_name, p_lead_email, p_lead_phone, p_pax_count, p_guests,
    v_price
  )
  RETURNING id INTO v_hold_id;

  RETURN jsonb_build_object(
    'hold_id',          v_hold_id,
    'expires_at',       v_expires_at,
    'price_per_person', v_price
  );
END;
$$;

-- Update confirm_booking_hold to record a payment per client when price is set
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

  UPDATE public.online_bookings
  SET    status = 'confirmed', hold_expires_at = NULL
  WHERE  id = p_hold_id;

  SELECT start_time::date INTO v_trip_date
  FROM   public.trips
  WHERE  id = v_booking.trip_id;

  -- Create one shared visit for the booking group
  INSERT INTO public.visits (organization_id, start_date, end_date)
  VALUES (v_booking.organization_id, v_trip_date, v_trip_date)
  RETURNING id INTO v_visit_id;

  -- Process each guest
  FOR v_guest IN SELECT * FROM jsonb_array_elements(v_booking.guests)
  LOOP
    v_name  := trim(v_guest->>'name');
    v_email := nullif(trim(v_guest->>'email'), '');

    v_first := split_part(v_name, ' ', 1);
    v_last  := trim(substring(v_name from length(split_part(v_name, ' ', 1)) + 2));

    v_client_id := NULL;
    IF v_email IS NOT NULL THEN
      SELECT id INTO v_client_id
      FROM   public.clients
      WHERE  organization_id = v_booking.organization_id
        AND  lower(email) = lower(v_email)
      LIMIT 1;
    END IF;

    IF v_client_id IS NULL THEN
      INSERT INTO public.clients (
        organization_id, first_name, last_name, email, phone
      ) VALUES (
        v_booking.organization_id,
        v_first,
        v_last,
        v_email,
        CASE WHEN v_guest = v_booking.guests->0 THEN v_booking.lead_phone ELSE NULL END
      )
      RETURNING id INTO v_client_id;
    END IF;

    INSERT INTO public.visit_clients (visit_id, client_id)
    VALUES (v_visit_id, v_client_id)
    ON CONFLICT (visit_id, client_id) DO NOTHING;

    INSERT INTO public.trip_clients (trip_id, client_id)
    VALUES (v_booking.trip_id, v_client_id)
    ON CONFLICT DO NOTHING;

    -- Record payment on the visit invoice if a price was set at booking time
    IF v_booking.price_per_person IS NOT NULL AND v_booking.price_per_person > 0 THEN
      PERFORM public.checkout_session(
        p_org_id            => v_booking.organization_id,
        p_visit_id          => v_visit_id,
        p_invoice_id        => NULL,
        p_client_id         => v_client_id,
        p_items             => '[]'::jsonb,
        p_payment_amount    => v_booking.price_per_person,
        p_payment_method    => 'online',
        p_recorded_by       => NULL,
        p_recorded_by_email => 'Online Booking'
      );
    END IF;

  END LOOP;

  RETURN jsonb_build_object('booking_id', p_hold_id, 'visit_id', v_visit_id);
END;
$$;
