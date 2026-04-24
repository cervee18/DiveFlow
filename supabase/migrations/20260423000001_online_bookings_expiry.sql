-- Enable pg_cron (pre-installed in Supabase, needs activating)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage so the job can run as postgres
GRANT USAGE ON SCHEMA cron TO postgres;

-- Function that flips stale held bookings to expired
CREATE OR REPLACE FUNCTION public.expire_stale_holds()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.online_bookings
  SET    status = 'expired'
  WHERE  status = 'held'
    AND  hold_expires_at < now();
$$;

-- Schedule: run every minute
SELECT cron.schedule(
  'expire-online-booking-holds',
  '* * * * *',
  'SELECT public.expire_stale_holds()'
);
