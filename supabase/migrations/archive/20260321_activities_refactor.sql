-- ============================================================
-- Migration: activities table refactor
--   1. Add abbreviation column
--   2. Rename requires_private → accept_certified_divers
--   3. Drop is_default column
--   4. Set abbreviations on all existing rows
--   5. Insert Pool 1–5 individual + pair configurations
-- ============================================================

-- 1. Add abbreviation column
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS abbreviation text;

-- 2. Rename column (requires_private → accept_certified_divers)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'activities'
      AND column_name  IN ('requires_private', 'Requires_private')
  ) THEN
    ALTER TABLE public.activities
      RENAME COLUMN "Requires_private" TO accept_certified_divers;
  END IF;
END $$;

-- 3. Drop is_default column
ALTER TABLE public.activities
  DROP COLUMN IF EXISTS is_default;

-- 4. Set abbreviations on existing rows
UPDATE public.activities SET abbreviation = 'D1'    WHERE name = 'Dive 1';
UPDATE public.activities SET abbreviation = 'D2'    WHERE name = 'Dive 2';
UPDATE public.activities SET abbreviation = 'D3'    WHERE name = 'Dive 3';
UPDATE public.activities SET abbreviation = 'D4'    WHERE name = 'Dive 4';
UPDATE public.activities SET abbreviation = 'D1&2'  WHERE name = 'Dives 1 & 2';
UPDATE public.activities SET abbreviation = 'D2&3'  WHERE name = 'Dives 2 & 3';
UPDATE public.activities SET abbreviation = 'D3&4'  WHERE name = 'Dives 3 & 4';
UPDATE public.activities SET abbreviation = 'Deep'  WHERE name = 'Deep';
UPDATE public.activities SET abbreviation = 'D&N'   WHERE name = 'Deep and Nav';
UPDATE public.activities SET abbreviation = 'Elec'  WHERE name = 'Electives';
UPDATE public.activities SET abbreviation = 'Ref'   WHERE name = 'Refresh';
UPDATE public.activities SET abbreviation = 'Res'   WHERE name = 'Resort';
UPDATE public.activities SET abbreviation = 'Spec'  WHERE name = 'Specialty';

-- 5. Insert Pool activities (accept_certified_divers = false — pool sessions are for students)
INSERT INTO public.activities (name, abbreviation, accept_certified_divers) VALUES
  -- Individual pools
  ('Pool 1',     'P1',    false),
  ('Pool 2',     'P2',    false),
  ('Pool 3',     'P3',    false),
  ('Pool 4',     'P4',    false),
  ('Pool 5',     'P5',    false),
  -- Pairs
  ('Pool 1 & 2', 'P1&2',  false),
  ('Pool 2 & 3', 'P2&3',  false),
  ('Pool 3 & 4', 'P3&4',  false),
  ('Pool 4 & 5', 'P4&5',  false)
ON CONFLICT DO NOTHING;
