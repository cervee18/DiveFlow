-- Atomically creates a hold: checks availability and inserts in one transaction.
-- Returns { hold_id, expires_at } on success or { error, available? } on failure.
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
  v_hold_id    uuid;
  v_expires_at timestamptz;
BEGIN
  -- Lock the trip row to prevent concurrent over-booking
  SELECT public.get_trip_available_spaces(t.id), t.organization_id
  INTO   v_available, v_org_id
  FROM   public.trips t
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
    lead_name, lead_email, lead_phone, pax_count, guests
  ) VALUES (
    v_org_id, p_trip_id, 'held', v_expires_at,
    p_lead_name, p_lead_email, p_lead_phone, p_pax_count, p_guests
  )
  RETURNING id INTO v_hold_id;

  RETURN jsonb_build_object('hold_id', v_hold_id, 'expires_at', v_expires_at);
END;
$$;

-- Confirms a held booking (called by payment webhook).
-- Returns { booking_id } on success or { error } on failure.
CREATE OR REPLACE FUNCTION public.confirm_booking_hold(p_hold_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_booking public.online_bookings;
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

  RETURN jsonb_build_object('booking_id', p_hold_id);
END;
$$;
