-- Update search to include all roles, not just clients
CREATE OR REPLACE FUNCTION public.search_organization_users(p_query text)
RETURNS TABLE (
  id uuid,
  email text,
  first_name text,
  last_name text,
  role text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_org_id uuid;
  v_admin_role text;
BEGIN
  -- Grab caller's org and role
  SELECT p.organization_id, p.role::text INTO v_org_id, v_admin_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  -- Auth guard: must be admin
  IF v_admin_role != 'admin' THEN
    RAISE EXCEPTION 'unauthorized: lacking admin role privileges';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    u.email::text,
    (u.raw_user_meta_data->>'first_name')::text AS first_name,
    (u.raw_user_meta_data->>'last_name')::text AS last_name,
    p.role::text,
    p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  -- Match admin's org OR match users who just signed up and haven't been assigned an org yet
  WHERE (p.organization_id = v_org_id OR p.organization_id IS NULL)
    AND (
      p_query IS NULL OR p_query = '' OR
      u.email ILIKE '%' || p_query || '%' OR
      (u.raw_user_meta_data->>'first_name') ILIKE '%' || p_query || '%' OR
      (u.raw_user_meta_data->>'last_name') ILIKE '%' || p_query || '%'
    )
  ORDER BY p.created_at DESC
  LIMIT 50;
END;
$$;

-- Allow modifying the target role freely without rejecting 'client'
CREATE OR REPLACE FUNCTION public.elevate_user_to_staff(p_user_id uuid, p_target_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_org_id uuid;
  v_admin_role text;
  v_user_email text;
  v_first_name text;
  v_last_name text;
  v_user_org_id uuid;
BEGIN
  -- Grab caller's org and role
  SELECT organization_id, role::text INTO v_org_id, v_admin_role
  FROM public.profiles
  WHERE id = auth.uid();

  -- Auth guard Check
  IF v_admin_role != 'admin' THEN
    RAISE EXCEPTION 'unauthorized: only admins can elevate staff';
  END IF;
  
  -- Target role must be valid
  IF p_target_role NOT IN ('client', 'staff_1', 'staff_2', 'admin') THEN
    RAISE EXCEPTION 'invalid role type';
  END IF;

  -- Ensure target user belongs to the same org, or is unassigned
  SELECT organization_id INTO v_user_org_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_user_org_id IS NOT NULL AND v_user_org_id != v_org_id THEN
    RAISE EXCEPTION 'user belongs to a different organization';
  END IF;

  -- Grab user metadata from auth schema
  SELECT email, raw_user_meta_data->>'first_name', raw_user_meta_data->>'last_name'
  INTO v_user_email, v_first_name, v_last_name
  FROM auth.users
  WHERE id = p_user_id;

  IF v_first_name IS NULL OR v_last_name IS NULL THEN
    v_first_name := COALESCE(v_first_name, 'Unknown');
    v_last_name := COALESCE(v_last_name, 'Unknown');
  END IF;

  -- Bypass the `prevent_profile_escalation` trigger momentarily for this secure admin transaction
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- 1. Update Profile Role AND lock their organization_id securely
  UPDATE public.profiles
  SET 
    role = p_target_role::public.user_role,
    organization_id = v_org_id
  WHERE id = p_user_id;

  -- 2. Insert into public.staff (Do not duplicate if email already exists)
  -- Note: If downgraded to client, we keep their staff record intact so old trips aren't orphaned by missing FK constraints.
  IF p_target_role IN ('staff_1', 'staff_2', 'admin') THEN
    INSERT INTO public.staff (user_id, email, first_name, last_name, organization_id)
    VALUES (p_user_id, v_user_email, v_first_name, v_last_name, v_org_id)
    ON CONFLICT (email) DO NOTHING;
  END IF;

END;
$$;
