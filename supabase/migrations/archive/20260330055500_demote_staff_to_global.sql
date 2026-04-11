-- Modify elevate function to respect multi-tenant Staff boundaries natively
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
  SELECT organization_id, role::text INTO v_org_id, v_admin_role
  FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_admin_role, '') != 'admin' THEN
    RAISE EXCEPTION 'unauthorized: only admins can elevate staff';
  END IF;
  
  IF p_target_role NOT IN ('client', 'staff_1', 'staff_2', 'admin') THEN
    RAISE EXCEPTION 'invalid role type';
  END IF;

  -- Cross-Tenant Hijack Guard
  SELECT organization_id INTO v_user_org_id
  FROM public.profiles WHERE id = p_user_id;

  IF v_user_org_id IS NOT NULL AND v_user_org_id != v_org_id THEN
    RAISE EXCEPTION 'User is currently employed by another dive organization and cannot be escalated. They can only be added as a local Client.';
  END IF;

  SELECT email, raw_user_meta_data->>'first_name', raw_user_meta_data->>'last_name'
  INTO v_user_email, v_first_name, v_last_name
  FROM auth.users WHERE id = p_user_id;

  -- Bypass trigger
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- Update Role & Lock OR Free them if demoted to Client
  UPDATE public.profiles
  SET 
    role = p_target_role::public.user_role,
    organization_id = CASE WHEN p_target_role = 'client' THEN NULL ELSE v_org_id END
  WHERE id = p_user_id;

  -- Scaffold local client container if missing
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE user_id = p_user_id AND organization_id = v_org_id) THEN
    INSERT INTO public.clients (user_id, email, first_name, last_name, organization_id)
    VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id);
  END IF;

  -- Assign to local Staff roster
  IF p_target_role IN ('staff_1', 'staff_2', 'admin') THEN
    INSERT INTO public.staff (user_id, email, first_name, last_name, organization_id)
    VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id)
    ON CONFLICT (email) DO NOTHING;
  END IF;

END;
$$;
