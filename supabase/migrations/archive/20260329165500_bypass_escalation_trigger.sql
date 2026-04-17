-- Enhance the elevation RPC to temporarily bypass the `prevent_profile_escalation` trigger
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
  IF p_target_role NOT IN ('staff_1', 'staff_2', 'admin') THEN
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
  INSERT INTO public.staff (user_id, email, first_name, last_name, organization_id)
  VALUES (p_user_id, v_user_email, v_first_name, v_last_name, v_org_id)
  ON CONFLICT (email) DO NOTHING;

END;
$$;
