-- Add last_dive_date to Global Profiles Passport
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "last_dive_date" "date";

-- Seamless Data Transfer Protocol:
-- Propagate existing last dive dates from the local clients upward
UPDATE "public"."profiles" p
SET 
  last_dive_date = c.last_dive_date
FROM (
  SELECT DISTINCT ON (user_id) user_id, last_dive_date
  FROM "public"."clients"
  WHERE user_id IS NOT NULL AND last_dive_date IS NOT NULL
  ORDER BY user_id, updated_at DESC
) c
WHERE p.id = c.user_id AND p.last_dive_date IS NULL;
