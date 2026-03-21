-- entry_mode is meaningless for Pool and Class trips; make it nullable
ALTER TABLE public.trips
  ALTER COLUMN entry_mode DROP NOT NULL;
