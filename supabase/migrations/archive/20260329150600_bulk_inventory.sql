CREATE TABLE IF NOT EXISTS "public"."bulk_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "size" "text",
    "quantity" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."bulk_inventory" OWNER TO "postgres";

ALTER TABLE ONLY "public"."bulk_inventory"
    ADD CONSTRAINT "bulk_inventory_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."bulk_inventory"
    ADD CONSTRAINT "bulk_inventory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."bulk_inventory"
    ADD CONSTRAINT "bulk_inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

-- Unique constraint so we don't have multiple rows for the same category+size in the same org
-- Coalesce size so NULL sizes still enforce uniqueness properly (or just rely on the DB tracking NULL as distinct, but standard approach: if size is NULL, we shouldn't have multiple NULL rows anyway).
CREATE UNIQUE INDEX "bulk_inventory_org_category_size_idx" ON "public"."bulk_inventory" ("organization_id", "category_id", COALESCE("size", ''));

CREATE INDEX "idx_bulk_inventory_org" ON "public"."bulk_inventory" USING "btree" ("organization_id");
CREATE INDEX "idx_bulk_inventory_category" ON "public"."bulk_inventory" USING "btree" ("category_id");

-- Enable RLS
ALTER TABLE "public"."bulk_inventory" ENABLE ROW LEVEL SECURITY;

-- Standard RLS policy based on the other tables
CREATE POLICY "Enable read/write for users based on organization_id" ON "public"."bulk_inventory"
    AS PERMISSIVE FOR ALL
    TO public
    USING (("organization_id" = "public"."my_org_id"()))
    WITH CHECK (("organization_id" = "public"."my_org_id"()));
