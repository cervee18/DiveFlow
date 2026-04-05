-- DEPLOYMENT SCRIPT: Definitive Global Identity Functions
-- You MUST run this entire script inside the Supabase Studio SQL Editor
-- This will cleanly overwrite both the Management Search algorithm and the Global Passport loader.

-- 1. Restore the Global Search Identity function completely.
-- (This fixes the "structure of query does not match" error caused by modifying the returns or select table)
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
  -- Verify the administrator
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
    ((p_query IS NULL OR length(trim(p_query)) < 3) 
     AND (p.organization_id = v_org_id OR c.id IS NOT NULL))
    OR 
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

-- 2. Restore the Read-Only Global Passport loader correctly
-- (This fixes our "p.first_name does not exist" core bug by cleanly joining the names out of auth.users instead)
CREATE OR REPLACE FUNCTION public.get_global_passport(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role text;
  v_passport json;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.role::text INTO v_caller_role FROM public.profiles p WHERE p.id = auth.uid();
  
  IF v_caller_role NOT IN ('staff_1', 'staff_2', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Insufficient privileges';
  END IF;

  -- Crucial fix: We dynamically weave the first_name and last_name securely from auth.users (u)
  SELECT json_build_object(
    'id', p.id,
    'email', u.email,
    'first_name', u.raw_user_meta_data->>'first_name',
    'last_name', u.raw_user_meta_data->>'last_name',
    'phone', p.phone,
    'address_street', p.address_street,
    'address_city', p.address_city,
    'address_zip', p.address_zip,
    'address_country', p.address_country,
    'emergency_contact_name', p.emergency_contact_name,
    'emergency_contact_phone', p.emergency_contact_phone,
    'cert_organization', p.cert_organization,
    'cert_level', p.cert_level,
    'cert_level_name', cl.name,
    'cert_level_abbr', cl.abbreviation,
    'cert_number', p.cert_number,
    'nitrox_cert_number', p.nitrox_cert_number,
    'last_dive_date', p.last_dive_date,
    'role', p.role,
    'organization_id', p.organization_id
  ) INTO v_passport
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.certification_levels cl ON p.cert_level = cl.id
  WHERE p.id = p_user_id;

  RETURN v_passport;
END;
$$;
