-- 1. Drop the strict foreign keys on alert_resolutions so it can support generic entities like staff
ALTER TABLE public.alert_resolutions
DROP CONSTRAINT IF EXISTS alert_resolutions_client_id_fkey,
DROP CONSTRAINT IF EXISTS alert_resolutions_trip_id_fkey;

-- 2. Drop the existing function so we can recreate it without return signature conflicts
DROP FUNCTION IF EXISTS public.get_active_alerts(uuid);

-- 3. Recreate the function with the new staff_double_booked branch
CREATE OR REPLACE FUNCTION public.get_active_alerts(p_org_id uuid)
RETURNS TABLE (
  alert_type    text,
  severity      text,
  trip_id       uuid,
  trip_start    timestamptz,
  trip_label    text,
  client_id     uuid,
  client_name   text,
  message       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$

  -- missing_waiver: client has no waiver, trip starts within 2 days
  SELECT
    'missing_waiver'::text                                AS alert_type,
    'critical'::text                                      AS severity,
    t.id                                                  AS trip_id,
    t.start_time                                          AS trip_start,
    COALESCE(t.label, tt.name, 'Trip')                   AS trip_label,
    c.id                                                  AS client_id,
    c.first_name || ' ' || c.last_name                   AS client_name,
    'Missing waiver: ' || c.first_name || ' ' || c.last_name AS message
  FROM public.trip_clients tc
  JOIN public.trips t     ON t.id  = tc.trip_id
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  JOIN public.clients c   ON c.id  = tc.client_id
  WHERE t.organization_id = p_org_id
    AND tc.waiver         = false
    AND t.start_time      > now()
    AND t.start_time     <= now() + INTERVAL '2 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id      = p_org_id
        AND ar.alert_type  = 'missing_waiver'
        AND ar.trip_id     = t.id
        AND ar.client_id   = tc.client_id
    )

  UNION ALL

  -- missing_deposit: client has no deposit, trip starts within 7 days
  SELECT
    'missing_deposit'::text,
    'warning'::text,
    t.id,
    t.start_time,
    COALESCE(t.label, tt.name, 'Trip'),
    c.id,
    c.first_name || ' ' || c.last_name,
    'Missing deposit: ' || c.first_name || ' ' || c.last_name
  FROM public.trip_clients tc
  JOIN public.trips t     ON t.id  = tc.trip_id
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  JOIN public.clients c   ON c.id  = tc.client_id
  WHERE t.organization_id = p_org_id
    AND tc.deposit        = false
    AND t.start_time      > now()
    AND t.start_time     <= now() + INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id      = p_org_id
        AND ar.alert_type  = 'missing_deposit'
        AND ar.trip_id     = t.id
        AND ar.client_id   = tc.client_id
    )

  UNION ALL

  -- no_staff: trip starts within 7 days and has no trip_staff entries
  SELECT
    'no_staff'::text,
    'critical'::text,
    t.id,
    t.start_time,
    COALESCE(t.label, tt.name, 'Trip'),
    NULL::uuid,
    NULL::text,
    'No staff assigned to trip'
  FROM public.trips t
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  WHERE t.organization_id = p_org_id
    AND t.start_time      > now()
    AND t.start_time     <= now() + INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.trip_staff ts WHERE ts.trip_id = t.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id     = p_org_id
        AND ar.alert_type = 'no_staff'
        AND ar.trip_id    = t.id
    )

  UNION ALL

  -- staff_double_booked: staff has >= 2 daily jobs on same date + AM/PM block
  SELECT
    'staff_double_booked'::text,
    'warning'::text,
    NULL::uuid,
    j.job_date::timestamptz,
    'Multiple Assignments'::text,
    s.id,
    COALESCE(s.first_name || ' ' || s.last_name, 'Staff'),
    COALESCE(s.first_name, 'Staff') || ' double-booked on ' || j.job_date::text || ' (' || j."AM/PM" || ')'
  FROM public.staff_daily_job j
  JOIN public.staff s ON s.id = j.staff_id
  LEFT JOIN public.job_types jt ON jt.id = j.job_type_id
  WHERE j.organization_id = p_org_id
    AND j.job_date >= current_date
    AND jt.name != 'Unassigned'
  GROUP BY j.job_date, j."AM/PM", s.id, s.first_name, s.last_name
  HAVING count(*) > 1
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id     = p_org_id
        AND ar.alert_type = 'staff_double_booked'
        AND ar.client_id  = s.id
        AND ar.notes      = (j.job_date::text || '_' || j."AM/PM")
    )

  ORDER BY trip_start ASC, alert_type ASC;

$$;
