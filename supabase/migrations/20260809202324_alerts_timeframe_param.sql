-- Add a configurable look-ahead window to get_active_alerts so the dashboard
-- can offer a timeframe selector (1 / 7 / 15 days) instead of hardcoded,
-- per-alert-type windows (previously 2 days for missing waivers, 7 days for
-- missing deposits/no-staff).

DROP FUNCTION IF EXISTS "public"."get_active_alerts"("p_org_id" "uuid");

CREATE OR REPLACE FUNCTION "public"."get_active_alerts"("p_org_id" "uuid", "p_days_ahead" integer DEFAULT 15) RETURNS TABLE("alert_type" "text", "severity" "text", "trip_id" "uuid", "trip_start" timestamp with time zone, "trip_label" "text", "client_id" "uuid", "client_name" "text", "message" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$

  -- missing_waiver: client has no waiver, trip starts within the selected window
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
    AND t.start_time     <= now() + make_interval(days => p_days_ahead)
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id      = p_org_id
        AND ar.alert_type  = 'missing_waiver'
        AND ar.trip_id     = t.id
        AND ar.client_id   = tc.client_id
    )

  UNION ALL

  -- missing_deposit: client has no deposit, trip starts within the selected window
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
    AND t.start_time     <= now() + make_interval(days => p_days_ahead)
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id      = p_org_id
        AND ar.alert_type  = 'missing_deposit'
        AND ar.trip_id     = t.id
        AND ar.client_id   = tc.client_id
    )

  UNION ALL

  -- no_staff: trip starts within the selected window and has no trip_staff entries
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
    AND t.start_time     <= now() + make_interval(days => p_days_ahead)
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
  -- (not time-windowed by p_days_ahead — unchanged from prior behavior)
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

ALTER FUNCTION "public"."get_active_alerts"("p_org_id" "uuid", "p_days_ahead" integer) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."get_active_alerts"("p_org_id" "uuid", "p_days_ahead" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_alerts"("p_org_id" "uuid", "p_days_ahead" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_alerts"("p_org_id" "uuid", "p_days_ahead" integer) TO "service_role";
