-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: vessel overlap constraint
-- Prevents the same vessel from being assigned to two trips whose time windows
-- overlap: [start_time, start_time + duration_minutes).
--
-- The trigger fires BEFORE INSERT OR UPDATE on public.trips so that any write
-- bypassing the client-side check (API, SQL editor, seed scripts) is also
-- rejected.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_vessel_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
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

-- Drop first so re-running the migration is idempotent
DROP TRIGGER IF EXISTS trips_vessel_overlap_check ON public.trips;

CREATE TRIGGER trips_vessel_overlap_check
  BEFORE INSERT OR UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vessel_overlap();
