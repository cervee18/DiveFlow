-- Allow trusted SECURITY DEFINER RPCs to change profile roles by setting a
-- transaction-local flag before the UPDATE. SET LOCAL is scoped to the current
-- transaction and cannot be set by client code through the normal API surface.

CREATE OR REPLACE FUNCTION public.prevent_profile_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Allow service_role (used by the seed scripts and admin API)
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow trusted internal RPCs that set this flag via SET LOCAL
  IF current_setting('app.allow_role_change', true) = 'true' THEN
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

-- Update update_staff_role_tier to set the bypass flag before the UPDATE
CREATE OR REPLACE FUNCTION update_staff_role_tier(p_user_id uuid, p_new_role user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_new_role NOT IN ('staff_1', 'staff_2', 'staff_3', 'staff_4', 'admin') THEN
    RAISE EXCEPTION 'Role must be staff_1, staff_2, staff_3, staff_4, or admin';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Scoped to this transaction only — cannot be set by external callers
  SET LOCAL app.allow_role_change = 'true';

  UPDATE public.profiles SET role = p_new_role WHERE id = p_user_id;
END;
$$;
