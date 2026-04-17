-- Test migration: verifies the Supabase CLI push workflow is operational.
-- Safe to keep — adds a comment to the activity_logs table, no data changes.
COMMENT ON TABLE public.activity_logs IS 'Audit log of admin-visible actions across trips, clients, and staff.';
