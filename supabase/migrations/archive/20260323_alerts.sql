-- ============================================================
-- Migration: Alerts system
-- - alert_resolutions table (stores dismissed/resolved alerts)
-- - get_active_alerts(p_org_id) function (computes firing alerts)
-- ============================================================


-- 1. alert_resolutions table
--    Stores acknowledgements of alerts. Once an alert is dismissed,
--    it won't appear again for the same (org, type, trip, client) combo.
--    resolved_by will be linked to staff.id once staff.profile_id is wired.
CREATE TABLE IF NOT EXISTS public.alert_resolutions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       uuid NOT NULL,
  alert_type   text NOT NULL,
  trip_id      uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  client_id    uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  resolved_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by  uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  notes        text
);

CREATE INDEX IF NOT EXISTS idx_alert_resolutions_org
  ON public.alert_resolutions(org_id);

CREATE INDEX IF NOT EXISTS idx_alert_resolutions_lookup
  ON public.alert_resolutions(org_id, alert_type, trip_id, client_id);


-- 2. RLS on alert_resolutions
ALTER TABLE public.alert_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view alert_resolutions"
  ON public.alert_resolutions FOR SELECT
  USING (
    org_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org members can insert alert_resolutions"
  ON public.alert_resolutions FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org members can delete alert_resolutions"
  ON public.alert_resolutions FOR DELETE
  USING (
    org_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );


-- 3. get_active_alerts(p_org_id uuid)
--    Returns all currently firing alerts that have not been dismissed.
--    Alert windows:
--      missing_waiver  → trip within 2 days  → severity: critical
--      missing_deposit → trip within 7 days  → severity: warning
--      no_staff        → trip within 7 days  → severity: critical
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

  ORDER BY trip_start ASC, alert_type ASC;

$$;
