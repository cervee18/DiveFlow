-- Role permissions system
-- Adds staff_3/staff_4 tiers, custom role names per org, and per-org permission grants.

-- Extend the enum (IF NOT EXISTS guards are safe for re-runs)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff_3';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff_4';

-- Custom display name per org per role
CREATE TABLE IF NOT EXISTS public.org_role_config (
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            user_role   NOT NULL,
  display_name    text        NOT NULL,
  PRIMARY KEY (organization_id, role)
);

-- Granted permissions per org per role (one row per granted permission)
CREATE TABLE IF NOT EXISTS public.org_role_permissions (
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role            user_role   NOT NULL,
  permission      text        NOT NULL,
  PRIMARY KEY (organization_id, role, permission)
);

-- Seed default names + permissions for every existing org
DO $$
DECLARE
  org_id uuid;
BEGIN
  FOR org_id IN SELECT id FROM public.organizations LOOP

    -- Default display names
    INSERT INTO public.org_role_config (organization_id, role, display_name) VALUES
      (org_id, 'staff_1', 'Senior Staff'),
      (org_id, 'staff_2', 'Staff'),
      (org_id, 'staff_3', 'Junior Staff'),
      (org_id, 'staff_4', 'Trainee')
    ON CONFLICT DO NOTHING;

    -- Default permissions
    -- staff_1: everything except management
    INSERT INTO public.org_role_permissions (organization_id, role, permission)
    SELECT org_id, 'staff_1', p FROM unnest(ARRAY[
      'page:overview', 'page:pos', 'page:staff', 'page:invoices', 'page:logs',
      'overview:confirm_trip', 'overview:create_trip', 'staff:move_staff'
    ]) p ON CONFLICT DO NOTHING;

    -- staff_2: core pages + granular ops
    INSERT INTO public.org_role_permissions (organization_id, role, permission)
    SELECT org_id, 'staff_2', p FROM unnest(ARRAY[
      'page:overview', 'page:pos', 'page:staff', 'page:invoices',
      'overview:confirm_trip', 'staff:move_staff'
    ]) p ON CONFLICT DO NOTHING;

    -- staff_3: overview + pos only
    INSERT INTO public.org_role_permissions (organization_id, role, permission)
    SELECT org_id, 'staff_3', p FROM unnest(ARRAY[
      'page:overview', 'page:pos'
    ]) p ON CONFLICT DO NOTHING;

    -- staff_4: overview read-only
    INSERT INTO public.org_role_permissions (organization_id, role, permission)
    SELECT org_id, 'staff_4', p FROM unnest(ARRAY[
      'page:overview'
    ]) p ON CONFLICT DO NOTHING;

  END LOOP;
END $$;

-- Returns full role config (names + permissions) for an org
CREATE OR REPLACE FUNCTION get_org_role_config(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'role',         c.role,
      'display_name', c.display_name,
      'permissions',  COALESCE(
        (SELECT jsonb_agg(p.permission)
         FROM public.org_role_permissions p
         WHERE p.organization_id = p_org_id AND p.role = c.role),
        '[]'::jsonb
      )
    )
    ORDER BY c.role
  )
  FROM public.org_role_config c
  WHERE c.organization_id = p_org_id
    AND c.role IN ('staff_1','staff_2','staff_3','staff_4');
$$;

-- Updates the display name for a role
CREATE OR REPLACE FUNCTION update_role_display_name(p_org_id uuid, p_role user_role, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  INSERT INTO public.org_role_config (organization_id, role, display_name)
  VALUES (p_org_id, p_role, p_name)
  ON CONFLICT (organization_id, role) DO UPDATE SET display_name = EXCLUDED.display_name;
END;
$$;

-- Replaces all permissions for a role (full replace, not additive)
CREATE OR REPLACE FUNCTION set_role_permissions(p_org_id uuid, p_role user_role, p_permissions text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM public.org_role_permissions
  WHERE organization_id = p_org_id AND role = p_role;
  INSERT INTO public.org_role_permissions (organization_id, role, permission)
  SELECT p_org_id, p_role, unnest(p_permissions)
  ON CONFLICT DO NOTHING;
END;
$$;
