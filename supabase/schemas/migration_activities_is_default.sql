-- ============================================================
-- Migration: add is_default flag to activities
-- When true, the activity is the standard/default (e.g. Fun Dive)
-- and is hidden from the staff trip card view.
-- ============================================================

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Mark your default activity after running this migration, e.g.:
--   UPDATE public.activities SET is_default = true WHERE name = 'Fun Dive';
