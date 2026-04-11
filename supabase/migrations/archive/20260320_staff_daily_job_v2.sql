-- ============================================================
-- Migration: staff_daily_job v2
-- - Make job_types.organization_id nullable (global job types)
-- - Seed global job types
-- - Add trip_id to staff_daily_job
-- - Fix trip_staff unique constraint to allow activity rows
-- ============================================================


-- 1. Make organization_id nullable on job_types
ALTER TABLE public.job_types
  ALTER COLUMN organization_id DROP NOT NULL;


-- 2. Fix trip_staff unique constraint.
--    Old constraint (trip_id, staff_id) blocks adding the same staff
--    to a trip for a specific activity when they are already on it generically.
--    Replace with two partial unique indexes:
--      a) Only one generic (activity_id IS NULL) row per trip+staff
--      b) Only one row per trip+staff+activity combination
ALTER TABLE public.trip_staff
  DROP CONSTRAINT IF EXISTS trip_staff_trip_id_staff_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS trip_staff_generic_unique
  ON public.trip_staff (trip_id, staff_id)
  WHERE activity_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trip_staff_activity_unique
  ON public.trip_staff (trip_id, staff_id, activity_id)
  WHERE activity_id IS NOT NULL;


-- 3. Add trip_id column to staff_daily_job (nullable)
ALTER TABLE public.staff_daily_job
  ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_daily_job_trip
  ON public.staff_daily_job (trip_id)
  WHERE trip_id IS NOT NULL;


-- 4. Seed global job types (organization_id = NULL means all orgs can use them).
--    Uses a DO block to avoid duplicates on re-run.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT name, sort_order FROM (VALUES
      ('Reception',    1),
      ('Reservations', 2),
      ('Operations',   3),
      ('Sick',         4),
      ('Holidays',     5),
      ('Off',          6),
      ('Crew',         7),
      ('Captain',      8),
      ('Private',      9),
      ('Course',      10),
      ('Unassigned',  11)
    ) AS t(name, sort_order)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.job_types
      WHERE name = r.name AND organization_id IS NULL
    ) THEN
      INSERT INTO public.job_types (organization_id, name, sort_order)
      VALUES (NULL, r.name, r.sort_order);
    END IF;
  END LOOP;
END $$;


-- 5. Update RLS policy on job_types to also allow rows where organization_id IS NULL
--    (global job types visible to all authenticated users)
DROP POLICY IF EXISTS "org members can view job_types" ON public.job_types;

CREATE POLICY "org members can view job_types"
  ON public.job_types FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );
