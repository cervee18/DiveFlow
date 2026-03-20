


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."entry_mode_type" AS ENUM (
    'Boat',
    'Shore',
    'Both'
);


ALTER TYPE "public"."entry_mode_type" OWNER TO "postgres";


CREATE TYPE "public"."equipment_condition" AS ENUM (
    'Excellent',
    'Good',
    'Needs Service',
    'Retired'
);


ALTER TYPE "public"."equipment_condition" OWNER TO "postgres";


CREATE TYPE "public"."subscription_plan_type" AS ENUM (
    'Basic',
    'Pro',
    'Enterprise'
);


ALTER TYPE "public"."subscription_plan_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'client',
    'staff_1',
    'staff_2',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_client_id        uuid;
  v_new_tc_id        uuid;
  v_last_tc          record;
  v_pick_up          boolean := false;
BEGIN
  FOREACH v_client_id IN ARRAY p_client_ids LOOP

    -- 1. Insert (unique constraint will raise 23505 if already on trip)
    INSERT INTO trip_clients (trip_id, client_id)
    VALUES (p_trip_id, v_client_id)
    RETURNING id INTO v_new_tc_id;

    -- 2. Most recent prior trip → equipment defaults
    SELECT tc.bcd, tc.wetsuit, tc.fins, tc.mask,
           tc.regulator, tc.computer,
           tc.nitrox1, tc.nitrox_percentage1,
           tc.nitrox2, tc.nitrox_percentage2,
           tc.weights, tc.private
    INTO v_last_tc
    FROM trip_clients tc
    JOIN trips t ON t.id = tc.trip_id
    WHERE tc.client_id = v_client_id
      AND tc.trip_id  != p_trip_id
      AND t.start_time::date < p_trip_date
    ORDER BY t.start_time DESC
    LIMIT 1;

    -- 3. pick_up → true if any same-visit trip already has it
    SELECT EXISTS (
      SELECT 1
      FROM trip_clients tc
      JOIN trips        t  ON t.id  = tc.trip_id
      JOIN visit_clients vc ON vc.client_id = v_client_id
      JOIN visits        v  ON v.id = vc.visit_id
      WHERE tc.client_id = v_client_id
        AND tc.trip_id  != p_trip_id
        AND tc.pick_up   = true
        AND t.start_time::date BETWEEN v.start_date AND v.end_date
        AND v.start_date <= p_trip_date
        AND v.end_date   >= p_trip_date
    ) INTO v_pick_up;

    -- 4. Apply pre-fill to the newly created row
    UPDATE trip_clients SET
      bcd                = COALESCE(v_last_tc.bcd,                bcd),
      wetsuit            = COALESCE(v_last_tc.wetsuit,            wetsuit),
      fins               = COALESCE(v_last_tc.fins,               fins),
      mask               = COALESCE(v_last_tc.mask,               mask),
      regulator          = COALESCE(v_last_tc.regulator,          regulator),
      computer           = COALESCE(v_last_tc.computer,           computer),
      nitrox1            = COALESCE(v_last_tc.nitrox1,            nitrox1),
      nitrox_percentage1 = COALESCE(v_last_tc.nitrox_percentage1, nitrox_percentage1),
      nitrox2            = COALESCE(v_last_tc.nitrox2,            nitrox2),
      nitrox_percentage2 = COALESCE(v_last_tc.nitrox_percentage2, nitrox_percentage2),
      weights            = COALESCE(v_last_tc.weights,            weights),
      private            = COALESCE(v_last_tc.private,            false),
      pick_up            = v_pick_up
    WHERE id = v_new_tc_id;

  END LOOP;
END;
$$;


ALTER FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'client');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean DEFAULT NULL::boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_visit_start date;
  v_visit_end   date;
BEGIN
  -- Resolve the visit covering this trip date (for pick_up scoping)
  SELECT v.start_date, v.end_date
  INTO v_visit_start, v_visit_end
  FROM visit_clients vc
  JOIN visits v ON v.id = vc.visit_id
  WHERE vc.client_id = p_client_id
    AND v.start_date <= p_trip_date::date
    AND v.end_date   >= p_trip_date::date
  LIMIT 1;

  -- Equipment → all future trip_client rows
  IF p_equipment IS NOT NULL AND p_equipment != '{}'::jsonb THEN
    UPDATE trip_clients tc SET
      bcd                = CASE WHEN p_equipment ? 'bcd'                THEN  p_equipment->>'bcd'                                        ELSE bcd                END,
      wetsuit            = CASE WHEN p_equipment ? 'wetsuit'            THEN  p_equipment->>'wetsuit'                                    ELSE wetsuit            END,
      fins               = CASE WHEN p_equipment ? 'fins'               THEN  p_equipment->>'fins'                                       ELSE fins               END,
      mask               = CASE WHEN p_equipment ? 'mask'               THEN  p_equipment->>'mask'                                       ELSE mask               END,
      regulator          = CASE WHEN p_equipment ? 'regulator'          THEN (p_equipment->>'regulator')::boolean                        ELSE regulator          END,
      computer           = CASE WHEN p_equipment ? 'computer'           THEN (p_equipment->>'computer')::boolean                         ELSE computer           END,
      nitrox1            = CASE WHEN p_equipment ? 'nitrox1'            THEN (p_equipment->>'nitrox1')::boolean                          ELSE nitrox1            END,
      nitrox_percentage1 = CASE WHEN p_equipment ? 'nitrox_percentage1' THEN (p_equipment->>'nitrox_percentage1')::integer               ELSE nitrox_percentage1 END,
      nitrox2            = CASE WHEN p_equipment ? 'nitrox2'            THEN (p_equipment->>'nitrox2')::boolean                          ELSE nitrox2            END,
      nitrox_percentage2 = CASE WHEN p_equipment ? 'nitrox_percentage2' THEN (p_equipment->>'nitrox_percentage2')::integer               ELSE nitrox_percentage2 END,
      weights            = CASE WHEN p_equipment ? 'weights'            THEN  p_equipment->>'weights'                                    ELSE weights            END,
      private            = CASE WHEN p_equipment ? 'private'            THEN (p_equipment->>'private')::boolean                         ELSE private            END
    FROM trips t
    WHERE tc.trip_id        = t.id
      AND tc.client_id      = p_client_id
      AND tc.trip_id       != p_current_trip_id
      AND t.start_time      >= p_trip_date::timestamptz;
  END IF;

  -- pick_up → same-visit future trips only
  IF p_pick_up IS NOT NULL AND v_visit_start IS NOT NULL THEN
    UPDATE trip_clients tc
    SET pick_up = p_pick_up
    FROM trips t
    WHERE tc.trip_id   = t.id
      AND tc.client_id = p_client_id
      AND tc.trip_id  != p_current_trip_id
      AND t.start_time >= p_trip_date::timestamptz
      AND t.start_time::date BETWEEN v_visit_start AND v_visit_end;
  END IF;

END;
$$;


ALTER FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "Requires_private" boolean,
    "is_default" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."certification_levels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "abbreviation" "text" NOT NULL,
    "name" "text",
    "is_professional" boolean DEFAULT false
);


ALTER TABLE "public"."certification_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."certification_organizations" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."certification_organizations" OWNER TO "postgres";


ALTER TABLE "public"."certification_organizations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."certification_organizations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "cert_number" "text",
    "cert_level" "uuid",
    "cert_organization" "text",
    "nitrox_cert_number" "text",
    "last_dive_date" "date",
    "address_street" "text",
    "address_city" "text",
    "address_zip" "text",
    "address_country" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "client_number" bigint NOT NULL
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


ALTER TABLE "public"."clients" ALTER COLUMN "client_number" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."clients_client_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "agency" "text" NOT NULL,
    "duration_days" integer,
    "price" numeric(10,2),
    "min_age" integer,
    "prerequisites" "text",
    "description" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dive_sites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "max_depth" numeric(5,1) NOT NULL,
    "latitude" numeric(9,6),
    "longitude" numeric(9,6),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid"
);


ALTER TABLE "public"."dive_sites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sizes" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."equipment_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hotels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address_street" "text",
    "address_city" "text",
    "address_zip" "text",
    "address_country" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hotels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "brand" "text",
    "model" "text",
    "size" "text",
    "serial_number" "text",
    "condition" "public"."equipment_condition" DEFAULT 'Good'::"public"."equipment_condition" NOT NULL,
    "last_service_date" "date",
    "next_service_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid"
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "color" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."job_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "address_street" "text",
    "address_city" "text",
    "address_zip" "text",
    "address_country" "text",
    "entry_modes" "public"."entry_mode_type" DEFAULT 'Both'::"public"."entry_mode_type" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "website" "text",
    "logo_url" "text",
    "entry_modes" "public"."entry_mode_type" DEFAULT 'Both'::"public"."entry_mode_type" NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "unit_system" "text" DEFAULT 'metric'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "subscription_plan" "public"."subscription_plan_type" DEFAULT 'Basic'::"public"."subscription_plan_type" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organizations_unit_system_check" CHECK (("unit_system" = ANY (ARRAY['metric'::"text", 'imperial'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."user_role" DEFAULT 'client'::"public"."user_role" NOT NULL,
    "organization_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."specialties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "agency" "text" NOT NULL
);


ALTER TABLE "public"."specialties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "certification_level_id" "uuid",
    "captain_license" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "initials" "text"
);


ALTER TABLE "public"."staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_daily_job" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "job_type_id" "uuid" NOT NULL,
    "job_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "AM/PM" "text",
    "trip_id" "uuid"
);


ALTER TABLE "public"."staff_daily_job" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_specialties" (
    "staff_id" "uuid" NOT NULL,
    "specialty_id" "uuid" NOT NULL
);


ALTER TABLE "public"."staff_specialties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "nitrox1" boolean DEFAULT false,
    "nitrox_percentage1" integer,
    "course_id" "uuid",
    "notes" "text",
    "mask" "text",
    "fins" "text",
    "bcd" "text",
    "regulator" boolean DEFAULT false,
    "wetsuit" "text",
    "computer" boolean DEFAULT false,
    "pick_up" boolean DEFAULT false,
    "waiver" boolean DEFAULT false,
    "deposit" boolean DEFAULT false,
    "weights" "text",
    "nitrox2" boolean,
    "nitrox_percentage2" integer,
    "activity_id" "uuid",
    "private" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."trip_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_staff" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "role_id" "uuid",
    "activity_id" "uuid"
);


ALTER TABLE "public"."trip_staff" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "default_start_time" time without time zone NOT NULL,
    "number_of_dives" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "abbreviation" "text"
);


ALTER TABLE "public"."trip_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text",
    "entry_mode" "text" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "duration_minutes" integer NOT NULL,
    "max_divers" integer NOT NULL,
    "dive_site_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "vessel_id" "uuid",
    "trip_type_id" "uuid"
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vessels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "name" "text" NOT NULL,
    "capacity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "abbreviation" "text",
    "need_captain" boolean
);


ALTER TABLE "public"."vessels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visit_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "visit_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "room_number" "text",
    "arrival_time" timestamp with time zone,
    "departure_time" timestamp with time zone,
    "transfer_needed" boolean DEFAULT false,
    "notes" "text"
);


ALTER TABLE "public"."visit_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "hotel_id" "uuid",
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."visits" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certification_levels"
    ADD CONSTRAINT "certification_levels_abbreviation_key" UNIQUE ("abbreviation");



ALTER TABLE ONLY "public"."certification_levels"
    ADD CONSTRAINT "certification_levels_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."certification_levels"
    ADD CONSTRAINT "certification_levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."certification_organizations"
    ADD CONSTRAINT "certification_organizations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."certification_organizations"
    ADD CONSTRAINT "certification_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dive_sites"
    ADD CONSTRAINT "dive_sites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_categories"
    ADD CONSTRAINT "equipment_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."equipment_categories"
    ADD CONSTRAINT "equipment_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hotels"
    ADD CONSTRAINT "hotels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_types"
    ADD CONSTRAINT "job_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."specialties"
    ADD CONSTRAINT "specialties_name_agency_key" UNIQUE ("name", "agency");



ALTER TABLE ONLY "public"."specialties"
    ADD CONSTRAINT "specialties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_specialties"
    ADD CONSTRAINT "staff_specialties_pkey" PRIMARY KEY ("staff_id", "specialty_id");



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_trip_id_client_id_key" UNIQUE ("trip_id", "client_id");



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_types"
    ADD CONSTRAINT "trip_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vessels"
    ADD CONSTRAINT "vessels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_clients"
    ADD CONSTRAINT "visit_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."visit_clients"
    ADD CONSTRAINT "visit_clients_visit_id_client_id_key" UNIQUE ("visit_id", "client_id");



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_clients_country" ON "public"."clients" USING "btree" ("address_country");



CREATE INDEX "idx_clients_email" ON "public"."clients" USING "btree" ("email");



CREATE INDEX "idx_clients_location" ON "public"."clients" USING "btree" ("location_id");



CREATE INDEX "idx_clients_org" ON "public"."clients" USING "btree" ("organization_id");



CREATE INDEX "idx_clients_user_id" ON "public"."clients" USING "btree" ("user_id");



CREATE INDEX "idx_courses_agency" ON "public"."courses" USING "btree" ("agency");



CREATE INDEX "idx_dive_sites_location" ON "public"."dive_sites" USING "btree" ("location_id");



CREATE INDEX "idx_dive_sites_org" ON "public"."dive_sites" USING "btree" ("organization_id");



CREATE INDEX "idx_hotels_organization" ON "public"."hotels" USING "btree" ("organization_id");



CREATE INDEX "idx_inventory_category" ON "public"."inventory" USING "btree" ("category_id");



CREATE INDEX "idx_inventory_condition" ON "public"."inventory" USING "btree" ("condition");



CREATE INDEX "idx_inventory_location" ON "public"."inventory" USING "btree" ("location_id");



CREATE INDEX "idx_inventory_org" ON "public"."inventory" USING "btree" ("organization_id");



CREATE INDEX "idx_job_types_org" ON "public"."job_types" USING "btree" ("organization_id", "sort_order");



CREATE INDEX "idx_locations_organization" ON "public"."locations" USING "btree" ("organization_id");



CREATE INDEX "idx_profiles_organization" ON "public"."profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_staff_daily_job_date" ON "public"."staff_daily_job" USING "btree" ("organization_id", "job_date");



CREATE INDEX "idx_staff_daily_job_trip" ON "public"."staff_daily_job" USING "btree" ("trip_id") WHERE ("trip_id" IS NOT NULL);



CREATE INDEX "idx_staff_email" ON "public"."staff" USING "btree" ("email");



CREATE INDEX "idx_staff_location" ON "public"."staff" USING "btree" ("location_id");



CREATE INDEX "idx_staff_org" ON "public"."staff" USING "btree" ("organization_id");



CREATE INDEX "idx_staff_specialties_specialty" ON "public"."staff_specialties" USING "btree" ("specialty_id");



CREATE INDEX "idx_staff_specialties_staff" ON "public"."staff_specialties" USING "btree" ("staff_id");



CREATE INDEX "idx_staff_user_id" ON "public"."staff" USING "btree" ("user_id");



CREATE INDEX "idx_trip_clients_client" ON "public"."trip_clients" USING "btree" ("client_id");



CREATE INDEX "idx_trip_clients_trip" ON "public"."trip_clients" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_staff_activity" ON "public"."trip_staff" USING "btree" ("trip_id", "activity_id");



CREATE INDEX "idx_trip_staff_staff" ON "public"."trip_staff" USING "btree" ("staff_id");



CREATE INDEX "idx_trip_staff_trip" ON "public"."trip_staff" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_types_organization" ON "public"."trip_types" USING "btree" ("organization_id");



CREATE INDEX "idx_trips_dive_site" ON "public"."trips" USING "btree" ("dive_site_id");



CREATE INDEX "idx_trips_location" ON "public"."trips" USING "btree" ("location_id");



CREATE INDEX "idx_trips_org" ON "public"."trips" USING "btree" ("organization_id");



CREATE INDEX "idx_trips_start_time" ON "public"."trips" USING "btree" ("start_time");



CREATE INDEX "idx_trips_trip_type" ON "public"."trips" USING "btree" ("trip_type_id");



CREATE INDEX "idx_trips_vessel" ON "public"."trips" USING "btree" ("vessel_id");



CREATE INDEX "idx_vessels_location" ON "public"."vessels" USING "btree" ("location_id");



CREATE INDEX "idx_vessels_organization" ON "public"."vessels" USING "btree" ("organization_id");



CREATE INDEX "idx_visit_clients_client" ON "public"."visit_clients" USING "btree" ("client_id");



CREATE INDEX "idx_visit_clients_visit" ON "public"."visit_clients" USING "btree" ("visit_id");



CREATE INDEX "idx_visits_hotel" ON "public"."visits" USING "btree" ("hotel_id");



CREATE INDEX "idx_visits_organization" ON "public"."visits" USING "btree" ("organization_id");



CREATE INDEX "idx_visits_start_date" ON "public"."visits" USING "btree" ("start_date");



CREATE UNIQUE INDEX "trip_staff_activity_unique" ON "public"."trip_staff" USING "btree" ("trip_id", "staff_id", "activity_id") WHERE ("activity_id" IS NOT NULL);



CREATE UNIQUE INDEX "trip_staff_generic_unique" ON "public"."trip_staff" USING "btree" ("trip_id", "staff_id") WHERE ("activity_id" IS NULL);



CREATE OR REPLACE TRIGGER "clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "courses_updated_at" BEFORE UPDATE ON "public"."courses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "dive_sites_updated_at" BEFORE UPDATE ON "public"."dive_sites" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "hotels_updated_at" BEFORE UPDATE ON "public"."hotels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "inventory_updated_at" BEFORE UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "locations_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "staff_updated_at" BEFORE UPDATE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trip_types_updated_at" BEFORE UPDATE ON "public"."trip_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trips_updated_at" BEFORE UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "vessels_updated_at" BEFORE UPDATE ON "public"."vessels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "visits_updated_at" BEFORE UPDATE ON "public"."visits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dive_sites"
    ADD CONSTRAINT "dive_sites_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dive_sites"
    ADD CONSTRAINT "dive_sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "fk_clients_cert_level" FOREIGN KEY ("cert_level") REFERENCES "public"."certification_levels"("id");



ALTER TABLE ONLY "public"."hotels"
    ADD CONSTRAINT "hotels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_types"
    ADD CONSTRAINT "job_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_certification_level_id_fkey" FOREIGN KEY ("certification_level_id") REFERENCES "public"."certification_levels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_job_type_id_fkey" FOREIGN KEY ("job_type_id") REFERENCES "public"."job_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_specialties"
    ADD CONSTRAINT "staff_specialties_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "public"."specialties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_specialties"
    ADD CONSTRAINT "staff_specialties_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff"
    ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id");



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_clients"
    ADD CONSTRAINT "trip_clients_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_types"
    ADD CONSTRAINT "trip_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_dive_site_id_fkey" FOREIGN KEY ("dive_site_id") REFERENCES "public"."dive_sites"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_trip_type_id_fkey" FOREIGN KEY ("trip_type_id") REFERENCES "public"."trip_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_vessel_id_fkey" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vessels"
    ADD CONSTRAINT "vessels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vessels"
    ADD CONSTRAINT "vessels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_clients"
    ADD CONSTRAINT "visit_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visit_clients"
    ADD CONSTRAINT "visit_clients_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visits"
    ADD CONSTRAINT "visits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE "public"."job_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org members can delete job_types" ON "public"."job_types" FOR DELETE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can delete staff_daily_job" ON "public"."staff_daily_job" FOR DELETE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can insert job_types" ON "public"."job_types" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can insert staff_daily_job" ON "public"."staff_daily_job" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can select job_types" ON "public"."job_types" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can select staff_daily_job" ON "public"."staff_daily_job" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can update job_types" ON "public"."job_types" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can update staff_daily_job" ON "public"."staff_daily_job" FOR UPDATE USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can view job_types" ON "public"."job_types" FOR SELECT USING ((("organization_id" IS NULL) OR ("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



ALTER TABLE "public"."staff_daily_job" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."certification_levels" TO "anon";
GRANT ALL ON TABLE "public"."certification_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."certification_levels" TO "service_role";



GRANT ALL ON TABLE "public"."certification_organizations" TO "anon";
GRANT ALL ON TABLE "public"."certification_organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."certification_organizations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."certification_organizations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."certification_organizations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."certification_organizations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clients_client_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clients_client_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clients_client_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."dive_sites" TO "anon";
GRANT ALL ON TABLE "public"."dive_sites" TO "authenticated";
GRANT ALL ON TABLE "public"."dive_sites" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_categories" TO "anon";
GRANT ALL ON TABLE "public"."equipment_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_categories" TO "service_role";



GRANT ALL ON TABLE "public"."hotels" TO "anon";
GRANT ALL ON TABLE "public"."hotels" TO "authenticated";
GRANT ALL ON TABLE "public"."hotels" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."job_types" TO "anon";
GRANT ALL ON TABLE "public"."job_types" TO "authenticated";
GRANT ALL ON TABLE "public"."job_types" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."specialties" TO "anon";
GRANT ALL ON TABLE "public"."specialties" TO "authenticated";
GRANT ALL ON TABLE "public"."specialties" TO "service_role";



GRANT ALL ON TABLE "public"."staff" TO "anon";
GRANT ALL ON TABLE "public"."staff" TO "authenticated";
GRANT ALL ON TABLE "public"."staff" TO "service_role";



GRANT ALL ON TABLE "public"."staff_daily_job" TO "anon";
GRANT ALL ON TABLE "public"."staff_daily_job" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_daily_job" TO "service_role";



GRANT ALL ON TABLE "public"."staff_specialties" TO "anon";
GRANT ALL ON TABLE "public"."staff_specialties" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_specialties" TO "service_role";



GRANT ALL ON TABLE "public"."trip_clients" TO "anon";
GRANT ALL ON TABLE "public"."trip_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_clients" TO "service_role";



GRANT ALL ON TABLE "public"."trip_staff" TO "anon";
GRANT ALL ON TABLE "public"."trip_staff" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_staff" TO "service_role";



GRANT ALL ON TABLE "public"."trip_types" TO "anon";
GRANT ALL ON TABLE "public"."trip_types" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_types" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";



GRANT ALL ON TABLE "public"."vessels" TO "anon";
GRANT ALL ON TABLE "public"."vessels" TO "authenticated";
GRANT ALL ON TABLE "public"."vessels" TO "service_role";



GRANT ALL ON TABLE "public"."visit_clients" TO "anon";
GRANT ALL ON TABLE "public"."visit_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."visit_clients" TO "service_role";



GRANT ALL ON TABLE "public"."visits" TO "anon";
GRANT ALL ON TABLE "public"."visits" TO "authenticated";
GRANT ALL ON TABLE "public"."visits" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







