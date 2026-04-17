-- Replace vessels.capacity with capacity_dive + capacity_snorkel.
-- Snorkel trips can fit more people (less gear), so vessels need two limits.
-- The trip type's category determines which one is used when creating a trip.
--
-- Also drops trip_types.capacity (added in 20260414000001) since capacity
-- is now entirely vessel-driven.

-- 1. Add the two new columns, defaulting to the existing capacity value
ALTER TABLE vessels
  ADD COLUMN IF NOT EXISTS capacity_dive    integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS capacity_snorkel integer NOT NULL DEFAULT 12;

-- 2. Seed both from the existing single capacity
UPDATE vessels SET capacity_dive = capacity, capacity_snorkel = capacity;

-- 3. Drop the old unified column
ALTER TABLE vessels DROP COLUMN IF EXISTS capacity;

-- 4. Drop capacity from trip_types (capacity now lives on vessels)
ALTER TABLE trip_types DROP COLUMN IF EXISTS capacity;
