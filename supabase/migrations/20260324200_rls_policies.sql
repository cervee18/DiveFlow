-- ============================================================
-- Migration: Row Level Security — all tables
-- ============================================================


-- ─── Helper: resolve the org_id of the current user ─────────────────────
CREATE OR REPLACE FUNCTION public.my_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. GLOBAL REFERENCE TABLES (shared, no org scope)
--    Any authenticated user can SELECT. No writes via client API.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.activities                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certification_levels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certification_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specialties                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories                  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref: select activities"                  ON public.activities;
DROP POLICY IF EXISTS "ref: select certification_levels"        ON public.certification_levels;
DROP POLICY IF EXISTS "ref: select certification_organizations" ON public.certification_organizations;
DROP POLICY IF EXISTS "ref: select courses"                     ON public.courses;
DROP POLICY IF EXISTS "ref: select equipment_categories"        ON public.equipment_categories;
DROP POLICY IF EXISTS "ref: select roles"                       ON public.roles;
DROP POLICY IF EXISTS "ref: select specialties"                 ON public.specialties;
DROP POLICY IF EXISTS "ref: select categories"                  ON public.categories;

CREATE POLICY "ref: select activities"
  ON public.activities FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ref: select certification_levels"
  ON public.certification_levels FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ref: select certification_organizations"
  ON public.certification_organizations FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ref: select courses"
  ON public.courses FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ref: select equipment_categories"
  ON public.equipment_categories FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ref: select roles"
  ON public.roles FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ref: select specialties"
  ON public.specialties FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "ref: select categories"
  ON public.categories FOR SELECT USING (auth.uid() IS NOT NULL);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. PROFILES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: read own"      ON public.profiles;
DROP POLICY IF EXISTS "profiles: read same org" ON public.profiles;

CREATE POLICY "profiles: read own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles: read same org"
  ON public.profiles FOR SELECT
  USING (
    public.my_org_id() IS NOT NULL
    AND organization_id = public.my_org_id()
  );

-- ── Privilege-escalation guard ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_profile_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'permission denied: role changes must go through the admin API';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'permission denied: organization changes must go through the admin API';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_escalation();


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ORGANIZATIONS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations: read own"   ON public.organizations;
DROP POLICY IF EXISTS "organizations: update own" ON public.organizations;

CREATE POLICY "organizations: read own"
  ON public.organizations FOR SELECT
  USING (id = public.my_org_id());

CREATE POLICY "organizations: update own"
  ON public.organizations FOR UPDATE
  USING  (id = public.my_org_id())
  WITH CHECK (id = public.my_org_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. CLIENTS
--
-- Rules:
--   (a) Org staff see clients belonging to their org.
--   (b) Signed-up clients (user_id IS NOT NULL) are visible to the staff
--       of ANY org — a diver may use multiple dive centers on the platform.
--   (c) A client user can always read/update their own record.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients: select"          ON public.clients;
DROP POLICY IF EXISTS "clients: insert"          ON public.clients;
DROP POLICY IF EXISTS "clients: update by staff" ON public.clients;
DROP POLICY IF EXISTS "clients: update own"      ON public.clients;
DROP POLICY IF EXISTS "clients: delete"          ON public.clients;

CREATE POLICY "clients: select"
  ON public.clients FOR SELECT
  USING (
    -- (a) staff sees own org's clients
    organization_id = public.my_org_id()
    OR
    -- (b) signed-up clients are visible to any org's staff
    (user_id IS NOT NULL AND public.my_org_id() IS NOT NULL)
    OR
    -- (c) client user sees their own record
    user_id = auth.uid()
  );

CREATE POLICY "clients: insert"
  ON public.clients FOR INSERT
  WITH CHECK (organization_id = public.my_org_id());

CREATE POLICY "clients: update by staff"
  ON public.clients FOR UPDATE
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());

CREATE POLICY "clients: update own"
  ON public.clients FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "clients: delete"
  ON public.clients FOR DELETE
  USING (organization_id = public.my_org_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. TRIPS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trips: org members" ON public.trips;

CREATE POLICY "trips: org members"
  ON public.trips FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. TRIP_CLIENTS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trip_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_clients: select" ON public.trip_clients;
DROP POLICY IF EXISTS "trip_clients: insert" ON public.trip_clients;
DROP POLICY IF EXISTS "trip_clients: update" ON public.trip_clients;
DROP POLICY IF EXISTS "trip_clients: delete" ON public.trip_clients;

CREATE POLICY "trip_clients: select"
  ON public.trip_clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_clients.trip_id
        AND t.organization_id = public.my_org_id()
    )
    OR client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "trip_clients: insert"
  ON public.trip_clients FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND t.organization_id = public.my_org_id()
    )
  );

CREATE POLICY "trip_clients: update"
  ON public.trip_clients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_clients.trip_id
        AND t.organization_id = public.my_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_clients.trip_id
        AND t.organization_id = public.my_org_id()
    )
  );

CREATE POLICY "trip_clients: delete"
  ON public.trip_clients FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_clients.trip_id
        AND t.organization_id = public.my_org_id()
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. TRIP_STAFF
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trip_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_staff: org members" ON public.trip_staff;

CREATE POLICY "trip_staff: org members"
  ON public.trip_staff FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_staff.trip_id
        AND t.organization_id = public.my_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND t.organization_id = public.my_org_id()
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. TRIP_TYPES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trip_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_types: org members" ON public.trip_types;

CREATE POLICY "trip_types: org members"
  ON public.trip_types FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. TRIP_DIVES, CLIENT_DIVE_LOGS, STAFF_DIVE_LOGS
--    No direct organization_id — org scope resolved through trips.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.trip_dives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_dives: org members" ON public.trip_dives;

CREATE POLICY "trip_dives: org members"
  ON public.trip_dives FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_dives.trip_id
        AND t.organization_id = public.my_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND t.organization_id = public.my_org_id()
    )
  );

ALTER TABLE public.client_dive_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_dive_logs: org members" ON public.client_dive_logs;

CREATE POLICY "client_dive_logs: org members"
  ON public.client_dive_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_dives td
      JOIN public.trips t ON t.id = td.trip_id
      WHERE td.id = client_dive_logs.trip_dive_id
        AND t.organization_id = public.my_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trip_dives td
      JOIN public.trips t ON t.id = td.trip_id
      WHERE td.id = trip_dive_id
        AND t.organization_id = public.my_org_id()
    )
  );

ALTER TABLE public.staff_dive_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_dive_logs: org members" ON public.staff_dive_logs;

CREATE POLICY "staff_dive_logs: org members"
  ON public.staff_dive_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_dives td
      JOIN public.trips t ON t.id = td.trip_id
      WHERE td.id = staff_dive_logs.trip_dive_id
        AND t.organization_id = public.my_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trip_dives td
      JOIN public.trips t ON t.id = td.trip_id
      WHERE td.id = trip_dive_id
        AND t.organization_id = public.my_org_id()
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 10. VISITS + VISIT_CLIENTS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visits: org members" ON public.visits;

CREATE POLICY "visits: org members"
  ON public.visits FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());

ALTER TABLE public.visit_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_clients: select" ON public.visit_clients;
DROP POLICY IF EXISTS "visit_clients: insert" ON public.visit_clients;
DROP POLICY IF EXISTS "visit_clients: update" ON public.visit_clients;
DROP POLICY IF EXISTS "visit_clients: delete" ON public.visit_clients;

CREATE POLICY "visit_clients: select"
  ON public.visit_clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_clients.visit_id
        AND v.organization_id = public.my_org_id()
    )
    OR client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "visit_clients: insert"
  ON public.visit_clients FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_id
        AND v.organization_id = public.my_org_id()
    )
  );

CREATE POLICY "visit_clients: update"
  ON public.visit_clients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_clients.visit_id
        AND v.organization_id = public.my_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_clients.visit_id
        AND v.organization_id = public.my_org_id()
    )
  );

CREATE POLICY "visit_clients: delete"
  ON public.visit_clients FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      WHERE v.id = visit_clients.visit_id
        AND v.organization_id = public.my_org_id()
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 11. STAFF + STAFF_SPECIALTIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff: org members" ON public.staff;

CREATE POLICY "staff: org members"
  ON public.staff FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());

ALTER TABLE public.staff_specialties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_specialties: org members" ON public.staff_specialties;

CREATE POLICY "staff_specialties: org members"
  ON public.staff_specialties FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_specialties.staff_id
        AND s.organization_id = public.my_org_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_id
        AND s.organization_id = public.my_org_id()
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 12. STAFF_DAILY_JOB
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.staff_daily_job ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_daily_job: org members" ON public.staff_daily_job;

CREATE POLICY "staff_daily_job: org members"
  ON public.staff_daily_job FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- 13. JOB_TYPES
--     organization_id is nullable (global presets have organization_id = NULL).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.job_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_types: select" ON public.job_types;
DROP POLICY IF EXISTS "job_types: write"  ON public.job_types;

CREATE POLICY "job_types: select"
  ON public.job_types FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id = public.my_org_id()
  );

CREATE POLICY "job_types: write"
  ON public.job_types FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- 14. ORG-SCOPED ASSET TABLES
--     divesites (renamed from dive_sites), hotels, inventory, locations, vessels
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.divesites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotels     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessels    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "divesites: org members"  ON public.divesites;
DROP POLICY IF EXISTS "hotels: org members"     ON public.hotels;
DROP POLICY IF EXISTS "inventory: org members"  ON public.inventory;
DROP POLICY IF EXISTS "locations: org members"  ON public.locations;
DROP POLICY IF EXISTS "vessels: org members"    ON public.vessels;

CREATE POLICY "divesites: org members"
  ON public.divesites FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());

CREATE POLICY "hotels: org members"
  ON public.hotels FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());

CREATE POLICY "inventory: org members"
  ON public.inventory FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());

CREATE POLICY "locations: org members"
  ON public.locations FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());

CREATE POLICY "vessels: org members"
  ON public.vessels FOR ALL
  USING  (organization_id = public.my_org_id())
  WITH CHECK (organization_id = public.my_org_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- 15. ACTIVITY_LOGS
--     Writes are performed exclusively by SECURITY DEFINER triggers —
--     no direct INSERT/UPDATE/DELETE from the client API.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs: select" ON public.activity_logs;

CREATE POLICY "activity_logs: select"
  ON public.activity_logs FOR SELECT
  USING (organization_id = public.my_org_id());
