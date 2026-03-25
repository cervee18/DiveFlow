-- ============================================================
-- Migration: Policy cleanup
--   1. Drop redundant old subquery-style policies on job_types
--      and staff_daily_job (superseded by 20260324200_rls_policies).
--   2. Migrate alert_resolutions policies to use my_org_id()
--      for consistency and performance.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. JOB_TYPES — drop legacy per-operation policies
--    Replaced by: "job_types: select" + "job_types: write"
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "org members can view job_types"   ON public.job_types;
DROP POLICY IF EXISTS "org members can select job_types" ON public.job_types;
DROP POLICY IF EXISTS "org members can insert job_types" ON public.job_types;
DROP POLICY IF EXISTS "org members can update job_types" ON public.job_types;
DROP POLICY IF EXISTS "org members can delete job_types" ON public.job_types;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. STAFF_DAILY_JOB — drop legacy per-operation policies
--    Replaced by: "staff_daily_job: org members"
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "org members can select staff_daily_job" ON public.staff_daily_job;
DROP POLICY IF EXISTS "org members can insert staff_daily_job" ON public.staff_daily_job;
DROP POLICY IF EXISTS "org members can update staff_daily_job" ON public.staff_daily_job;
DROP POLICY IF EXISTS "org members can delete staff_daily_job" ON public.staff_daily_job;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ALERT_RESOLUTIONS — replace subquery policies with my_org_id()
--    Note: this table uses org_id (not organization_id) as the FK column.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "org members can view alert_resolutions"   ON public.alert_resolutions;
DROP POLICY IF EXISTS "org members can insert alert_resolutions" ON public.alert_resolutions;
DROP POLICY IF EXISTS "org members can delete alert_resolutions" ON public.alert_resolutions;

CREATE POLICY "alert_resolutions: select"
  ON public.alert_resolutions FOR SELECT
  USING (org_id = public.my_org_id());

CREATE POLICY "alert_resolutions: insert"
  ON public.alert_resolutions FOR INSERT
  WITH CHECK (org_id = public.my_org_id());

CREATE POLICY "alert_resolutions: delete"
  ON public.alert_resolutions FOR DELETE
  USING (org_id = public.my_org_id());
