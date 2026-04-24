-- Step 1: flag trip types as online-bookable
ALTER TABLE public.trip_types
  ADD COLUMN IF NOT EXISTS online_bookable boolean NOT NULL DEFAULT false;

-- Step 2: online_bookings table
CREATE TABLE IF NOT EXISTS public.online_bookings (
  id               uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  organization_id  uuid        NOT NULL,
  trip_id          uuid        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'held'
                               CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired')),
  hold_expires_at  timestamptz,
  lead_name        text        NOT NULL,
  lead_email       text,
  lead_phone       text,
  pax_count        integer     NOT NULL CHECK (pax_count > 0),
  -- array of { name: string, email?: string }, first entry is the lead
  guests           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- Step 3: indexes
CREATE INDEX IF NOT EXISTS idx_online_bookings_trip_id
  ON public.online_bookings (trip_id);

CREATE INDEX IF NOT EXISTS idx_online_bookings_org_status
  ON public.online_bookings (organization_id, status);

-- partial index: only held bookings need expiry scans
CREATE INDEX IF NOT EXISTS idx_online_bookings_expiry
  ON public.online_bookings (hold_expires_at)
  WHERE status = 'held';

-- Step 4: updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_online_bookings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_online_bookings_updated_at
  BEFORE UPDATE ON public.online_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_online_bookings_updated_at();

-- Step 5: available spaces function
-- Returns max_divers minus confirmed trip_clients minus active online booking pax.
-- Treats held bookings as occupied only while hold_expires_at is in the future.
CREATE OR REPLACE FUNCTION public.get_trip_available_spaces(p_trip_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    t.max_divers
    - (SELECT COUNT(*)::integer FROM public.trip_clients tc WHERE tc.trip_id = t.id)
    - COALESCE((
        SELECT SUM(ob.pax_count)::integer
        FROM public.online_bookings ob
        WHERE ob.trip_id = t.id
          AND ob.status IN ('held', 'confirmed')
          AND (ob.status = 'confirmed' OR ob.hold_expires_at > now())
      ), 0)
  FROM public.trips t
  WHERE t.id = p_trip_id;
$$;

-- Step 6: RLS — staff manage bookings within their org; API uses service role (bypasses RLS)
ALTER TABLE public.online_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage online bookings"
  ON public.online_bookings
  FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );
