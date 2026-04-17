-- Replace the single default_start_time with separate AM and PM defaults.
-- This lets each trip type define its preferred morning and afternoon start times
-- independently, so the overview's + buttons can derive the correct time from
-- the trip type rather than using a hardcoded fallback.
ALTER TABLE trip_types
  RENAME COLUMN default_start_time TO default_start_time_am;

ALTER TABLE trip_types
  ADD COLUMN IF NOT EXISTS default_start_time_pm time NOT NULL DEFAULT '13:00';
