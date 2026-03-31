-- Add Global Passport Fields to profiles table
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "phone" "text",
  ADD COLUMN IF NOT EXISTS "address_street" "text",
  ADD COLUMN IF NOT EXISTS "address_city" "text",
  ADD COLUMN IF NOT EXISTS "address_zip" "text",
  ADD COLUMN IF NOT EXISTS "address_country" "text",
  ADD COLUMN IF NOT EXISTS "emergency_contact_name" "text",
  ADD COLUMN IF NOT EXISTS "emergency_contact_phone" "text",
  ADD COLUMN IF NOT EXISTS "cert_organization" "text",
  ADD COLUMN IF NOT EXISTS "cert_level" "uuid",
  ADD COLUMN IF NOT EXISTS "cert_number" "text",
  ADD COLUMN IF NOT EXISTS "nitrox_cert_number" "text";

-- Safely add foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'profiles_cert_level_fkey'
  ) THEN
    ALTER TABLE "public"."profiles"
      ADD CONSTRAINT profiles_cert_level_fkey 
      FOREIGN KEY ("cert_level") 
      REFERENCES "public"."certification_levels"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Seamless Data Transfer Protocol:
-- Propagate existing Client data directly up into the Global Profiles.
UPDATE "public"."profiles" p
SET 
  phone = c.phone,
  address_street = c.address_street,
  address_city = c.address_city,
  address_zip = c.address_zip,
  address_country = c.address_country,
  cert_organization = c.cert_organization,
  cert_level = c.cert_level,
  cert_number = c.cert_number,
  nitrox_cert_number = c.nitrox_cert_number
FROM (
  SELECT DISTINCT ON (user_id) 
    user_id, phone, address_street, address_city, address_zip, 
    address_country, cert_organization, cert_level, cert_number, nitrox_cert_number
  FROM "public"."clients"
  WHERE user_id IS NOT NULL
  ORDER BY user_id, updated_at DESC
) c
WHERE p.id = c.user_id;
