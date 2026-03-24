-- ============================================================
-- Migration: introduce categories table
--   1. Create categories lookup table
--   2. Seed the four categories
--   3. Rename trip_types.type → trip_types.category + add FK
--   4. Normalise existing trip_types category values
--   5. Add category column to activities + populate
-- ============================================================

-- 1. Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

-- 2. Seed categories
INSERT INTO public.categories (name) VALUES
  ('Dive'),
  ('Pool'),
  ('Class'),
  ('Snorkel')
ON CONFLICT (name) DO NOTHING;

-- 3. Rename trip_types.type → category
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'trip_types'
      AND column_name  = 'type'
  ) THEN
    ALTER TABLE public.trip_types RENAME COLUMN type TO category;
  END IF;
END $$;

-- 4. Normalise existing category values to match categories table
--    Legacy values: 'dive', 'diving', 'Diving' → 'Dive'
--                   'snorkel', 'Snorkel'        → 'Snorkel'
--                   'Pool' / 'Class' already correct
UPDATE public.trip_types
  SET category = 'Dive'
  WHERE lower(category) IN ('dive', 'diving');

UPDATE public.trip_types
  SET category = 'Snorkel'
  WHERE lower(category) = 'snorkel';

-- 5. Add FK constraint from trip_types.category → categories.name
ALTER TABLE public.trip_types
  DROP CONSTRAINT IF EXISTS trip_types_category_fkey;

ALTER TABLE public.trip_types
  ADD CONSTRAINT trip_types_category_fkey
    FOREIGN KEY (category) REFERENCES public.categories (name)
    ON UPDATE CASCADE;

-- 6. Add category column to activities
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS category text REFERENCES public.categories (name) ON UPDATE CASCADE;

-- 7. Populate activities.category
--    Pool activities → 'Pool', everything else → 'Dive'
UPDATE public.activities
  SET category = 'Pool'
  WHERE name ILIKE 'Pool%';

UPDATE public.activities
  SET category = 'Dive'
  WHERE category IS NULL;
