-- ============================================================
-- Migration: add activity_id to trip_staff and fix uniqueness
--
-- The original UNIQUE(trip_id, staff_id) constraint prevents
-- a staff member from appearing in both a generic trip assignment
-- and an activity-specific one on the same trip.
--
-- Solution: replace with two partial unique indexes so that:
--   • A staff member can have at most one GENERIC slot per trip
--     (activity_id IS NULL)
--   • A staff member can have at most one slot per trip+activity
--     (activity_id IS NOT NULL)
-- ============================================================

-- 1. Add the activity_id column
ALTER TABLE public.trip_staff
  ADD COLUMN IF NOT EXISTS activity_id uuid
    REFERENCES public.activities(id) ON DELETE SET NULL;

-- 2. Drop the old blanket unique constraint
ALTER TABLE public.trip_staff
  DROP CONSTRAINT IF EXISTS "trip_staff_trip_id_staff_id_key";

-- 3. Partial unique index: one generic assignment per staff+trip
CREATE UNIQUE INDEX IF NOT EXISTS trip_staff_generic_unique
  ON public.trip_staff (trip_id, staff_id)
  WHERE activity_id IS NULL;

-- 4. Partial unique index: one assignment per staff+trip+activity
CREATE UNIQUE INDEX IF NOT EXISTS trip_staff_activity_unique
  ON public.trip_staff (trip_id, staff_id, activity_id)
  WHERE activity_id IS NOT NULL;

-- 5. Index for fast lookups by trip + activity
CREATE INDEX IF NOT EXISTS idx_trip_staff_activity
  ON public.trip_staff (trip_id, activity_id);
