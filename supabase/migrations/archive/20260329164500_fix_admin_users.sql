-- Drop the old generic one
DROP FUNCTION IF EXISTS public.get_organization_users();

-- Create a robust search-driven version
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
  -- Grab caller's org and role. 
  -- We explicitly alias the table 'p' to avoid collision with OUT parameters like 'role'.
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
  WHERE p.organization_id = v_org_id
    AND p.role = 'client'
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
