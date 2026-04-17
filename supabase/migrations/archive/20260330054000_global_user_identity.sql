-- Phase 1: Re-structure the admin user search to be a Global Cross-Tenant Directory
DROP FUNCTION IF EXISTS public.search_organization_users(text);

CREATE OR REPLACE FUNCTION public.search_global_identities(p_query text)
RETURNS TABLE (
  id uuid,
  email text,
  first_name text,
  last_name text,
  role text,
  created_at timestamptz,
  organization_id uuid,
  is_local_client boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_org_id uuid;
  v_admin_role text;
BEGIN
  SELECT p.organization_id, p.role::text INTO v_org_id, v_admin_role
  FROM public.profiles p WHERE p.id = auth.uid();

  IF COALESCE(v_admin_role, '') != 'admin' THEN
    RAISE EXCEPTION 'unauthorized: lacking admin privileges';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    u.email::text,
    (u.raw_user_meta_data->>'first_name')::text AS first_name,
    (u.raw_user_meta_data->>'last_name')::text AS last_name,
    p.role::text,
    p.created_at,
    p.organization_id,
    (c.id IS NOT NULL) AS is_local_client
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.clients c ON c.user_id = u.id AND c.organization_id = v_org_id
  WHERE 
    -- Scenario A: Empty Query -> Only show users who either work here or are already a client here
    ((p_query IS NULL OR length(trim(p_query)) < 3) 
     AND (p.organization_id = v_org_id OR c.id IS NOT NULL))
    OR 
    -- Scenario B: Valid >= 3 Query -> Search globally
    (length(trim(p_query)) >= 3 
     AND (
       u.email ILIKE '%' || p_query || '%' OR
       (u.raw_user_meta_data->>'first_name') ILIKE '%' || p_query || '%' OR
       (u.raw_user_meta_data->>'last_name') ILIKE '%' || p_query || '%'
     ))
  ORDER BY 
    (p.organization_id = v_org_id OR c.id IS NOT NULL) DESC,
    p.created_at DESC
  LIMIT 50;
END;
$$;

-- Phase 2: Create a formal method to import a global identity locally as a Client
CREATE OR REPLACE FUNCTION public.add_client_to_organization(p_user_id uuid)
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
  v_exists boolean;
BEGIN
  SELECT organization_id, role::text INTO v_org_id, v_admin_role
  FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_admin_role, '') != 'admin' THEN
    RAISE EXCEPTION 'unauthorized: lacking admin privileges';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.clients WHERE user_id = p_user_id AND organization_id = v_org_id)
  INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'User is already a client in your dive center.';
  END IF;

  SELECT email, raw_user_meta_data->>'first_name', raw_user_meta_data->>'last_name'
  INTO v_user_email, v_first_name, v_last_name
  FROM auth.users WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found in the global registry.';
  END IF;

  INSERT INTO public.clients (user_id, email, first_name, last_name, organization_id)
  VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id);
END;
$$;

-- Phase 3: Enhance Staff Escalator with Hijack Defenses
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

  SELECT organization_id INTO v_user_org_id
  FROM public.profiles WHERE id = p_user_id;

  IF v_user_org_id IS NOT NULL AND v_user_org_id != v_org_id THEN
    RAISE EXCEPTION 'This user is already an active Staff member at another dive center. You may only Add them as a Local Client.';
  END IF;

  SELECT email, raw_user_meta_data->>'first_name', raw_user_meta_data->>'last_name'
  INTO v_user_email, v_first_name, v_last_name
  FROM auth.users WHERE id = p_user_id;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  UPDATE public.profiles
  SET 
    role = p_target_role::public.user_role,
    organization_id = v_org_id
  WHERE id = p_user_id;

  -- Scaffold local client container if missing
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE user_id = p_user_id AND organization_id = v_org_id) THEN
    INSERT INTO public.clients (user_id, email, first_name, last_name, organization_id)
    VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id);
  END IF;

  IF p_target_role IN ('staff_1', 'staff_2', 'admin') THEN
    INSERT INTO public.staff (user_id, email, first_name, last_name, organization_id)
    VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id)
    ON CONFLICT (email) DO NOTHING;
  END IF;

END;
$$;
