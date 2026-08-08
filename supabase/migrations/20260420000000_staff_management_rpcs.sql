-- Staff management RPCs for Team tab

-- Returns all staff for the organization with profile role and cert level
CREATE OR REPLACE FUNCTION get_organization_staff(p_org_id uuid)
RETURNS TABLE (
  staff_id          uuid,
  user_id           uuid,
  first_name        text,
  last_name         text,
  email             text,
  phone             text,
  initials          text,
  captain_license   boolean,
  notes             text,
  cert_abbreviation text,
  cert_name         text,
  role              text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    s.user_id,
    s.first_name,
    s.last_name,
    s.email,
    s.phone,
    s.initials,
    s.captain_license,
    s.notes,
    cl.abbreviation,
    cl.name,
    p.role::text
  FROM public.staff s
  LEFT JOIN public.certification_levels cl ON cl.id = s.certification_level_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.organization_id = p_org_id
  ORDER BY s.first_name, s.last_name;
$$;

-- Allows admins to toggle captain license on a staff record
CREATE OR REPLACE FUNCTION update_staff_captain_license(p_staff_id uuid, p_captain_license boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.staff SET captain_license = p_captain_license WHERE id = p_staff_id;
END;
$$;

-- Allows admins to change a staff member's role tier (bypasses trg_prevent_profile_escalation)
CREATE OR REPLACE FUNCTION update_staff_role_tier(p_user_id uuid, p_new_role user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_new_role NOT IN ('staff_1', 'staff_2', 'admin') THEN
    RAISE EXCEPTION 'Role must be staff_1, staff_2, or admin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles SET role = p_new_role WHERE id = p_user_id;

  -- Keep staff row in sync: ensure a staff row exists (elevate_user_to_staff may have created it already)
  INSERT INTO public.staff (user_id, first_name, last_name, email, organization_id)
  SELECT
    p_user_id,
    coalesce((u.raw_user_meta_data->>'first_name'), ''),
    coalesce((u.raw_user_meta_data->>'last_name'), ''),
    u.email,
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  FROM auth.users u
  WHERE u.id = p_user_id
  ON CONFLICT DO NOTHING;
END;
$$;
