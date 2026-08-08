-- Force PostgREST to reload its schema cache. Needed after the 2026-08-08
-- catch-up push (20260420010000..20260510000000) since the CLI version in use
-- doesn't reliably trigger this automatically, leaving PostgREST unaware of
-- newly added columns/tables (e.g. trip_types.online_bookable) despite them
-- existing in the database.
NOTIFY pgrst, 'reload schema';
