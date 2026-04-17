CREATE OR REPLACE FUNCTION public.get_global_passport(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role text;
  v_passport json;
BEGIN
  -- Strict Check: Is caller properly authenticated?
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Cast ENUM to text explicitly to avoid PL/pgSQL type mismatch
  SELECT role::text INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  
  IF v_caller_role NOT IN ('staff_1', 'staff_2', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: Insufficient privileges to view global passports';
  END IF;

  SELECT json_build_object(
    'id', p.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'email', p.email,
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
  LEFT JOIN public.certification_levels cl ON p.cert_level = cl.id
  WHERE p.id = p_user_id;

  RETURN v_passport;
END;
$$;
