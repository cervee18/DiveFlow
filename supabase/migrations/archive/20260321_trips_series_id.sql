-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add series_id to trips
-- Trips created as a repeating batch share the same series_id uuid.
-- Single trips leave series_id NULL.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS series_id uuid DEFAULT NULL;

-- Partial index — only indexes rows that are part of a series
CREATE INDEX IF NOT EXISTS idx_trips_series
  ON public.trips (series_id)
  WHERE series_id IS NOT NULL;
