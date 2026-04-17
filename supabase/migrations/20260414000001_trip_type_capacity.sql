-- Add capacity to trip_types.
-- This defines how many divers a trip of this type can hold,
-- independent of the vessel's physical capacity.
ALTER TABLE trip_types
  ADD COLUMN IF NOT EXISTS capacity integer NOT NULL DEFAULT 12;
