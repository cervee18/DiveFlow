-- Extend user_role enum with staff_3/staff_4 tiers.
-- Split into its own migration: a new enum value cannot be used in the
-- same transaction that adds it (Postgres SQLSTATE 55P04), so this must
-- commit before 20260420010000_role_permissions_system.sql runs.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff_3';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff_4';
