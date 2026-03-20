-- ============================================================
-- Migration: replace user_role enum
-- Removes old 'staff' value, adds 'staff_1' and 'staff_2'
-- Existing 'staff' rows are migrated to 'staff_1'
-- ============================================================

-- 1. Create the new enum
CREATE TYPE public.user_role_new AS ENUM ('client', 'staff_1', 'staff_2', 'admin');

-- 2. Drop the default so the column type can be changed
ALTER TABLE public.profiles
  ALTER COLUMN role DROP DEFAULT;

-- 3. Migrate the column, mapping old 'staff' → 'staff_1'
ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.user_role_new
  USING CASE
    WHEN role::text = 'staff' THEN 'staff_1'::public.user_role_new
    ELSE role::text::public.user_role_new
  END;

-- 4. Drop the old enum and rename the new one
DROP TYPE public.user_role;
ALTER TYPE public.user_role_new RENAME TO user_role;

-- 5. Restore the default
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'client'::public.user_role;
