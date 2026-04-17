


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


CREATE OR REPLACE FUNCTION "public"."add_client_to_organization"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_org_id uuid;
  v_admin_role text;
  v_user_email text;
  v_first_name text;
  v_last_name text;
  v_exists boolean;
BEGIN
  SELECT organization_id, role::text INTO v_org_id, v_admin_role
  FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_admin_role, '') != 'admin' THEN
    RAISE EXCEPTION 'unauthorized: lacking admin privileges';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.clients WHERE user_id = p_user_id AND organization_id = v_org_id)
  INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'User is already a client in your dive center.';
  END IF;

  SELECT email, raw_user_meta_data->>'first_name', raw_user_meta_data->>'last_name'
  INTO v_user_email, v_first_name, v_last_name
  FROM auth.users WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'User not found in the global registry.';
  END IF;

  INSERT INTO public.clients (user_id, email, first_name, last_name, organization_id)
  VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id);
END;
$$;


ALTER FUNCTION "public"."add_client_to_organization"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_client_id        uuid;
  v_new_tc_id        uuid;
  v_last_tc          record;
  v_pick_up          boolean := false;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.profiles p ON p.organization_id = t.organization_id
    WHERE t.id = p_trip_id
      AND p.id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'permission denied: you do not have access to this trip';
  END IF;

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


CREATE OR REPLACE FUNCTION "public"."add_items_to_client_tab"("p_org_id" "uuid", "p_client_id" "uuid", "p_visit_id" "uuid", "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_invoice_id uuid;
  v_item       jsonb;
BEGIN
  -- ── Step 1: resolve invoice ─────────────────────────────────────────────────
  IF p_visit_id IS NOT NULL THEN
    -- One invoice per visit (UNIQUE constraint)
    INSERT INTO public.pos_invoices (organization_id, visit_id, client_id)
    VALUES (p_org_id, p_visit_id, p_client_id)
    ON CONFLICT (visit_id) DO NOTHING;

    SELECT id INTO v_invoice_id
    FROM   public.pos_invoices
    WHERE  visit_id = p_visit_id;

  ELSE
    -- Client-only: find most recent open invoice or create one
    SELECT id INTO v_invoice_id
    FROM   public.pos_invoices
    WHERE  client_id = p_client_id
      AND  visit_id  IS NULL
      AND  status    = 'open'
    ORDER  BY created_at DESC
    LIMIT  1;

    IF NOT FOUND THEN
      INSERT INTO public.pos_invoices (organization_id, visit_id, client_id)
      VALUES (p_org_id, NULL, p_client_id)
      RETURNING id INTO v_invoice_id;
    END IF;
  END IF;

  -- ── Step 2: insert items ────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.pos_invoice_items
      (invoice_id, pos_product_id, client_id, unit_price, quantity)
    VALUES (
      v_invoice_id,
      (v_item->>'product_id')::uuid,
      p_client_id,
      (v_item->>'price')::numeric,
      (v_item->>'qty')::integer
    );
  END LOOP;

  RETURN jsonb_build_object('invoice_id', v_invoice_id);
END;
$$;


ALTER FUNCTION "public"."add_items_to_client_tab"("p_org_id" "uuid", "p_client_id" "uuid", "p_visit_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_items_to_client_tab"("p_org_id" "uuid", "p_client_id" "uuid", "p_visit_id" "uuid", "p_items" "jsonb", "p_recorded_by" "uuid" DEFAULT NULL::"uuid", "p_recorded_by_email" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_invoice_id uuid;
  v_txn_id     uuid;
  v_item       jsonb;
BEGIN
  -- ── Step 1: resolve invoice ─────────────────────────────────────────────────
  IF p_visit_id IS NOT NULL THEN
    INSERT INTO public.pos_invoices (organization_id, visit_id, client_id)
    VALUES (p_org_id, p_visit_id, p_client_id)
    ON CONFLICT (visit_id) DO NOTHING;

    SELECT id INTO v_invoice_id
    FROM   public.pos_invoices
    WHERE  visit_id = p_visit_id;

  ELSE
    SELECT id INTO v_invoice_id
    FROM   public.pos_invoices
    WHERE  client_id = p_client_id
      AND  visit_id  IS NULL
      AND  status    = 'open'
    ORDER  BY created_at DESC
    LIMIT  1;

    IF NOT FOUND THEN
      INSERT INTO public.pos_invoices (organization_id, visit_id, client_id)
      VALUES (p_org_id, NULL, p_client_id)
      RETURNING id INTO v_invoice_id;
    END IF;
  END IF;

  -- ── Step 2: create transaction record (captures who added this batch) ───────
  INSERT INTO public.pos_transactions (invoice_id, recorded_by_email)
  VALUES (v_invoice_id, p_recorded_by_email)
  RETURNING id INTO v_txn_id;

  -- ── Step 3: insert items linked to the transaction ──────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.pos_invoice_items
      (invoice_id, transaction_id, pos_product_id, client_id, unit_price, quantity)
    VALUES (
      v_invoice_id,
      v_txn_id,
      (v_item->>'product_id')::uuid,
      p_client_id,
      (v_item->>'price')::numeric,
      (v_item->>'qty')::integer
    );
  END LOOP;

  RETURN jsonb_build_object(
    'invoice_id',     v_invoice_id,
    'transaction_id', v_txn_id
  );
END;
$$;


ALTER FUNCTION "public"."add_items_to_client_tab"("p_org_id" "uuid", "p_client_id" "uuid", "p_visit_id" "uuid", "p_items" "jsonb", "p_recorded_by" "uuid", "p_recorded_by_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_visit_invoice_payload"("p_visit_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_invoice_status      text    := 'open';
  v_invoice_id          uuid    := null;
  v_visit_start         date;
  v_visit_end           date;
  v_org_id              uuid;
  v_rental_daily_cap    numeric(10,2);
  v_clients             jsonb;
  v_shared_group_items  jsonb;
  v_unassigned_payments jsonb;
  v_master_subtotal     numeric := 0;
  v_master_paid         numeric := 0;
  v_master_balance      numeric := 0;
  v_result              json;
BEGIN
  SELECT v.start_date, v.end_date, v.organization_id
  INTO   v_visit_start, v_visit_end, v_org_id
  FROM   public.visits v WHERE v.id = p_visit_id;

  SELECT id, status INTO v_invoice_id, v_invoice_status
  FROM   public.pos_invoices WHERE visit_id = p_visit_id LIMIT 1;

  SELECT rental_daily_cap INTO v_rental_daily_cap
  FROM   public.org_pos_config WHERE organization_id = v_org_id;

  WITH visit_clients_list AS (
    SELECT c.id AS client_id,
           c.first_name || ' ' || c.last_name AS client_name
    FROM   public.visit_clients vc
    JOIN   public.clients c ON c.id = vc.client_id
    WHERE  vc.visit_id = p_visit_id
  ),

  -- Pre-load all waivers for this visit so each CTE can check them
  visit_waivers AS (
    SELECT client_id, item_key
    FROM   public.pos_auto_item_waivers
    WHERE  visit_id = p_visit_id
  ),

  client_trip_type_counts AS (
    SELECT tc.client_id,
           t.trip_type_id,
           COUNT(*) AS trip_count
    FROM   public.trip_clients tc
    JOIN   public.trips      t  ON t.id  = tc.trip_id
    JOIN   public.trip_types tt ON tt.id = t.trip_type_id
    WHERE  tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND  t.start_time::date BETWEEN v_visit_start AND v_visit_end
      AND  tt.billing_via_activity = false
      AND  tt.pos_product_id IS NOT NULL
    GROUP  BY tc.client_id, t.trip_type_id
  ),

  client_tier_prices AS (
    SELECT ctc.client_id,
           ctc.trip_type_id,
           (
             SELECT tpt.unit_price
             FROM   public.trip_pricing_tiers tpt
             WHERE  tpt.trip_type_id = ctc.trip_type_id
               AND  tpt.min_qty      <= ctc.trip_count
             ORDER  BY tpt.min_qty DESC
             LIMIT  1
           ) AS tier_price
    FROM   client_trip_type_counts ctc
  ),

  client_trips_list AS (
    SELECT tc.client_id,
           tc.id                             AS trip_client_id,
           'trip:' || tc.id::text            AS item_key,
           t.id                              AS trip_id,
           t.start_time,
           pp.name                           AS product_name,
           COALESCE(ctp.tier_price, pp.price) AS effective_price
    FROM   public.trip_clients   tc
    JOIN   public.trips          t   ON t.id   = tc.trip_id
    JOIN   public.trip_types     tt  ON tt.id  = t.trip_type_id
    JOIN   public.pos_products   pp  ON pp.id  = tt.pos_product_id
    LEFT   JOIN client_tier_prices ctp
            ON  ctp.client_id    = tc.client_id
            AND ctp.trip_type_id = tt.id
    WHERE  tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND  t.start_time::date BETWEEN v_visit_start AND v_visit_end
      AND  tt.billing_via_activity = false
      AND  tt.pos_product_id IS NOT NULL
  ),

  daily_rental_items AS (
    SELECT tc.client_id,
           t.start_time::date AS trip_date,
           frm.rental_field,
           pp.name,
           MAX(pp.price) AS price
    FROM   public.trip_clients        tc
    JOIN   public.trips               t   ON t.id  = tc.trip_id
    JOIN   public.pos_rental_mappings frm ON frm.organization_id = t.organization_id
    JOIN   public.pos_products        pp  ON pp.id = frm.pos_product_id
    WHERE  tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND  t.start_time::date BETWEEN v_visit_start AND v_visit_end
      AND  (
             (frm.rental_field = 'mask'      AND tc.mask IS NOT NULL AND tc.mask != '') OR
             (frm.rental_field = 'fins'      AND tc.fins IS NOT NULL AND tc.fins != '') OR
             (frm.rental_field = 'bcd'       AND tc.bcd  IS NOT NULL AND tc.bcd  != '') OR
             (frm.rental_field = 'regulator' AND tc.regulator = true)                  OR
             (frm.rental_field = 'wetsuit'   AND tc.wetsuit IS NOT NULL AND tc.wetsuit != '') OR
             (frm.rental_field = 'computer'  AND tc.computer = true)                   OR
             (frm.rental_field = 'nitrox'    AND tc.nitrox1  = true)
           )
    GROUP  BY tc.client_id, t.start_time::date, frm.rental_field, pp.name
  ),

  daily_rental_totals AS (
    SELECT client_id,
           trip_date,
           SUM(price) AS raw_total,
           LEAST(SUM(price), COALESCE(v_rental_daily_cap, SUM(price))) AS charged_amount
    FROM   daily_rental_items
    GROUP  BY client_id, trip_date
  ),

  automated_items AS (

    -- ① Trips
    SELECT ctl.client_id,
           jsonb_build_object(
             'item_key',   ctl.item_key,
             'name',       ctl.product_name,
             'price',      CASE WHEN vw.item_key IS NOT NULL THEN 0 ELSE ctl.effective_price END,
             'type',       'trip',
             'trip_id',    ctl.trip_id,
             'trip_date',  ctl.start_time,
             'waived',     (vw.item_key IS NOT NULL)
           ) AS item,
           CASE WHEN vw.item_key IS NOT NULL THEN 0 ELSE ctl.effective_price END AS price_num
    FROM   client_trips_list ctl
    LEFT   JOIN visit_waivers vw
           ON  vw.client_id = ctl.client_id
           AND vw.item_key  = ctl.item_key

    UNION ALL

    -- ② Private guide fee
    SELECT tc.client_id,
           jsonb_build_object(
             'item_key',  'guide:' || t.id::text,
             'name',      pp.name,
             'price',     CASE WHEN vw.item_key IS NOT NULL THEN 0 ELSE pp.price END,
             'type',      'private_guide',
             'trip_id',   t.id,
             'trip_date', t.start_time,
             'waived',    (vw.item_key IS NOT NULL)
           ) AS item,
           CASE WHEN vw.item_key IS NOT NULL THEN 0 ELSE pp.price END AS price_num
    FROM   public.trip_clients  tc
    JOIN   public.trips         t   ON t.id  = tc.trip_id
    JOIN   public.org_pos_config opc ON opc.organization_id = v_org_id
    JOIN   public.pos_products  pp  ON pp.id = opc.private_instruction_product_id
    LEFT   JOIN visit_waivers   vw
           ON  vw.client_id = tc.client_id
           AND vw.item_key  = 'guide:' || t.id::text
    WHERE  tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND  t.start_time::date BETWEEN v_visit_start AND v_visit_end
      AND  tc.private = true

    UNION ALL

    -- ③ Rental uncapped
    SELECT dri.client_id,
           jsonb_build_object(
             'item_key',  'rental:' || dri.trip_date::text,
             'name',      dri.name || ' Rental',
             'price',     CASE WHEN vw.item_key IS NOT NULL THEN 0 ELSE dri.price END,
             'type',      'rental',
             'trip_date', dri.trip_date::timestamptz,
             'waived',    (vw.item_key IS NOT NULL)
           ) AS item,
           CASE WHEN vw.item_key IS NOT NULL THEN 0 ELSE dri.price END AS price_num
    FROM   daily_rental_items dri
    JOIN   daily_rental_totals drt
           ON  drt.client_id = dri.client_id
           AND drt.trip_date = dri.trip_date
    LEFT   JOIN visit_waivers vw
           ON  vw.client_id = dri.client_id
           AND vw.item_key  = 'rental:' || dri.trip_date::text
    WHERE  drt.raw_total <= drt.charged_amount

    UNION ALL

    -- ④ Rental capped
    SELECT drt.client_id,
           jsonb_build_object(
             'item_key',  'rental:' || drt.trip_date::text,
             'name',      'Full Rental Gear',
             'price',     CASE WHEN vw.item_key IS NOT NULL THEN 0 ELSE drt.charged_amount END,
             'type',      'rental',
             'trip_date', drt.trip_date::timestamptz,
             'waived',    (vw.item_key IS NOT NULL)
           ) AS item,
           CASE WHEN vw.item_key IS NOT NULL THEN 0 ELSE drt.charged_amount END AS price_num
    FROM   daily_rental_totals drt
    LEFT   JOIN visit_waivers vw
           ON  vw.client_id = drt.client_id
           AND vw.item_key  = 'rental:' || drt.trip_date::text
    WHERE  drt.raw_total > drt.charged_amount
  ),

  client_aggs AS (
    SELECT vcl.client_id,
           vcl.client_name,
           COALESCE(
             (SELECT jsonb_agg(item) FROM automated_items ai WHERE ai.client_id = vcl.client_id),
             '[]'::jsonb
           ) AS automated_items,
           COALESCE(
             (SELECT SUM(price_num) FROM automated_items ai WHERE ai.client_id = vcl.client_id),
             0
           ) AS auto_subtotal,
           COALESCE(
             (SELECT jsonb_agg(jsonb_build_object(
                       'item_id', pii.id,
                       'name',    pp.name,
                       'price',   pii.unit_price,
                       'qty',     pii.quantity))
              FROM   public.pos_invoice_items pii
              JOIN   public.pos_products pp ON pp.id = pii.pos_product_id
              WHERE  pii.invoice_id = v_invoice_id AND pii.client_id = vcl.client_id),
             '[]'::jsonb
           ) AS manual_items,
           COALESCE(
             (SELECT SUM(pii.unit_price * pii.quantity)
              FROM   public.pos_invoice_items pii
              WHERE  pii.invoice_id = v_invoice_id AND pii.client_id = vcl.client_id),
             0
           ) AS manual_subtotal,
           COALESCE(
             (SELECT jsonb_agg(jsonb_build_object('date', ppay.created_at, 'amount', ppay.amount, 'method', ppay.payment_method))
              FROM   public.pos_payments ppay
              WHERE  ppay.invoice_id = v_invoice_id AND ppay.client_id = vcl.client_id AND ppay.voided_at IS NULL),
             '[]'::jsonb
           ) AS payments,
           COALESCE(
             (SELECT SUM(ppay.amount)
              FROM   public.pos_payments ppay
              WHERE  ppay.invoice_id = v_invoice_id AND ppay.client_id = vcl.client_id AND ppay.voided_at IS NULL),
             0
           ) AS paid_total
    FROM   visit_clients_list vcl
  )
  SELECT jsonb_object_agg(
    client_id,
    jsonb_build_object(
      'client_name',     client_name,
      'automated_items', automated_items,
      'manual_items',    manual_items,
      'payments',        payments,
      'totals', jsonb_build_object(
        'subtotal',    auto_subtotal + manual_subtotal,
        'paid',        paid_total,
        'balance_due', (auto_subtotal + manual_subtotal) - paid_total
      )
    )
  ) INTO v_clients
  FROM client_aggs;

  IF v_clients IS NULL THEN v_clients := '{}'::jsonb; END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('name', pp.name, 'price', pii.unit_price, 'qty', pii.quantity)),
    '[]'::jsonb
  ) INTO v_shared_group_items
  FROM   public.pos_invoice_items pii
  JOIN   public.pos_products pp ON pp.id = pii.pos_product_id
  WHERE  pii.invoice_id = v_invoice_id AND pii.client_id IS NULL;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('date', ppay.created_at, 'amount', ppay.amount, 'method', ppay.payment_method)),
    '[]'::jsonb
  ) INTO v_unassigned_payments
  FROM   public.pos_payments ppay
  WHERE  ppay.invoice_id = v_invoice_id AND ppay.client_id IS NULL AND ppay.voided_at IS NULL;

  SELECT
    COALESCE(SUM((val->'totals'->>'subtotal')::numeric), 0),
    COALESCE(SUM((val->'totals'->>'paid')::numeric),     0)
  INTO v_master_subtotal, v_master_paid
  FROM jsonb_each(v_clients) AS t(key, val);

  v_master_subtotal := v_master_subtotal + COALESCE(
    (SELECT SUM(unit_price * quantity) FROM public.pos_invoice_items
     WHERE invoice_id = v_invoice_id AND client_id IS NULL), 0);
  v_master_paid := v_master_paid + COALESCE(
    (SELECT SUM(amount) FROM public.pos_payments
     WHERE invoice_id = v_invoice_id AND client_id IS NULL AND voided_at IS NULL), 0);
  v_master_balance := v_master_subtotal - v_master_paid;

  v_result := jsonb_build_object(
    'visit_id',            p_visit_id,
    'invoice_id',          v_invoice_id,
    'status',              COALESCE(v_invoice_status, 'open'),
    'clients',             v_clients,
    'shared_group_items',  COALESCE(v_shared_group_items,  '[]'::jsonb),
    'unassigned_payments', COALESCE(v_unassigned_payments, '[]'::jsonb),
    'grand_totals', jsonb_build_object(
      'master_subtotal', v_master_subtotal,
      'master_paid',     v_master_paid,
      'master_balance',  v_master_balance
    )
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."calculate_visit_invoice_payload"("p_visit_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cascade_trip_removal_on_visit_client_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_requires_visit boolean;
  v_start_date     date;
  v_end_date       date;
BEGIN
  SELECT requires_visit INTO v_requires_visit
  FROM public.clients WHERE id = OLD.client_id;

  IF NOT COALESCE(v_requires_visit, true) THEN
    RETURN OLD;
  END IF;

  -- If visit no longer exists (whole-visit delete — handled by cascade_trips_on_visit_delete)
  SELECT start_date, end_date INTO v_start_date, v_end_date
  FROM public.visits WHERE id = OLD.visit_id;

  IF v_start_date IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.trip_clients tc
  USING public.trips t
  WHERE tc.trip_id   = t.id
    AND tc.client_id = OLD.client_id
    AND t.start_time::date >= v_start_date
    AND t.start_time::date <= v_end_date;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."cascade_trip_removal_on_visit_client_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cascade_trips_on_visit_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.trip_clients tc
  USING public.trips t,
        public.visit_clients vc,
        public.clients c
  WHERE tc.trip_id   = t.id
    AND tc.client_id = vc.client_id
    AND vc.visit_id  = OLD.id
    AND c.id         = vc.client_id
    AND c.requires_visit = true
    AND t.start_time::date >= OLD.start_date
    AND t.start_time::date <= OLD.end_date;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."cascade_trips_on_visit_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_trip_capacity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_max_divers integer;
  v_booked     integer;
BEGIN
  SELECT max_divers INTO v_max_divers
  FROM public.trips
  WHERE id = NEW.trip_id;

  -- Count existing rows, excluding the row being updated (UPDATE path)
  SELECT COUNT(*) INTO v_booked
  FROM public.trip_clients
  WHERE trip_id = NEW.trip_id
    AND id IS DISTINCT FROM NEW.id;

  IF v_booked >= v_max_divers THEN
    RAISE EXCEPTION 'trip_capacity_exceeded: trip is full (% / %)', v_booked, v_max_divers
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_trip_capacity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_vessel_overlap"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Skip the check when no vessel is assigned
  IF NEW.vessel_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM   public.trips
    WHERE  vessel_id        = NEW.vessel_id
      AND  id              != NEW.id   -- exclude the row itself (safe for INSERT too,
                                       -- because the new uuid doesn't exist yet)
      AND  start_time       < NEW.start_time + (NEW.duration_minutes * INTERVAL '1 minute')
      AND  start_time + (duration_minutes * INTERVAL '1 minute') > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'vessel_overlap: vessel % is already assigned to another trip during this time window',
      NEW.vessel_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_vessel_overlap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."checkout_session"("p_org_id" "uuid", "p_visit_id" "uuid", "p_invoice_id" "uuid", "p_client_id" "uuid", "p_items" "jsonb", "p_payment_amount" numeric, "p_payment_method" "text", "p_recorded_by" "uuid", "p_recorded_by_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_invoice_id   uuid;
  v_txn_id       uuid;
  v_item         jsonb;
BEGIN
  -- ── Step 1: resolve invoice ─────────────────────────────────────────────────
  IF p_invoice_id IS NOT NULL THEN
    -- Caller already knows the invoice
    v_invoice_id := p_invoice_id;

  ELSIF p_visit_id IS NOT NULL THEN
    -- Visit-based: exactly one invoice per visit (UNIQUE constraint on visit_id).
    -- ON CONFLICT DO NOTHING + subsequent SELECT is race-safe inside a transaction.
    INSERT INTO public.pos_invoices (organization_id, visit_id, client_id)
    VALUES (p_org_id, p_visit_id, p_client_id)
    ON CONFLICT (visit_id) DO NOTHING;

    SELECT id INTO v_invoice_id
    FROM   public.pos_invoices
    WHERE  visit_id = p_visit_id;

  ELSE
    -- Walk-in terminal sale: fresh invoice every time
    INSERT INTO public.pos_invoices (organization_id, visit_id, client_id)
    VALUES (p_org_id, NULL, p_client_id)
    RETURNING id INTO v_invoice_id;
  END IF;

  -- ── Step 2: create transaction record ──────────────────────────────────────
  INSERT INTO public.pos_transactions (invoice_id)
  VALUES (v_invoice_id)
  RETURNING id INTO v_txn_id;

  -- ── Step 3: insert line items ───────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.pos_invoice_items
      (invoice_id, transaction_id, pos_product_id, client_id, unit_price, quantity)
    VALUES (
      v_invoice_id,
      v_txn_id,
      (v_item->>'product_id')::uuid,
      p_client_id,
      (v_item->>'price')::numeric,
      (v_item->>'qty')::integer
    );
  END LOOP;

  -- ── Step 4: insert payment (optional) ──────────────────────────────────────
  IF p_payment_amount IS NOT NULL AND p_payment_amount > 0 THEN
    INSERT INTO public.pos_payments
      (invoice_id, transaction_id, amount, payment_method, client_id,
       recorded_by, recorded_by_email)
    VALUES (
      v_invoice_id,
      v_txn_id,
      p_payment_amount,
      p_payment_method,
      p_client_id,
      p_recorded_by,
      p_recorded_by_email
    );
  END IF;

  RETURN jsonb_build_object(
    'invoice_id',     v_invoice_id,
    'transaction_id', v_txn_id
  );
END;
$$;


ALTER FUNCTION "public"."checkout_session"("p_org_id" "uuid", "p_visit_id" "uuid", "p_invoice_id" "uuid", "p_client_id" "uuid", "p_items" "jsonb", "p_payment_amount" numeric, "p_payment_method" "text", "p_recorded_by" "uuid", "p_recorded_by_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_trip_series"("p_org_id" "uuid", "p_label" "text", "p_trip_type_id" "uuid", "p_entry_mode" "text", "p_duration_mins" integer, "p_max_divers" integer, "p_vessel_id" "uuid", "p_start_times" timestamp with time zone[]) RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_series_id uuid := gen_random_uuid();
  v_ids       uuid[];
BEGIN
  WITH inserted AS (
    INSERT INTO public.trips (
      organization_id,
      label,
      trip_type_id,
      entry_mode,
      duration_minutes,
      max_divers,
      vessel_id,
      start_time,
      series_id
    )
    SELECT
      p_org_id,
      p_label,
      p_trip_type_id,
      p_entry_mode,
      p_duration_mins,
      p_max_divers,
      p_vessel_id,
      t,
      v_series_id
    FROM unnest(p_start_times) AS t
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM inserted;

  RETURN v_ids;
END;
$$;


ALTER FUNCTION "public"."create_trip_series"("p_org_id" "uuid", "p_label" "text", "p_trip_type_id" "uuid", "p_entry_mode" "text", "p_duration_mins" integer, "p_max_divers" integer, "p_vessel_id" "uuid", "p_start_times" timestamp with time zone[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."elevate_user_to_staff"("p_user_id" "uuid", "p_target_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_org_id uuid;
  v_admin_role text;
  v_user_email text;
  v_first_name text;
  v_last_name text;
  v_user_org_id uuid;
BEGIN
  SELECT organization_id, role::text INTO v_org_id, v_admin_role
  FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_admin_role, '') != 'admin' THEN
    RAISE EXCEPTION 'unauthorized: only admins can elevate staff';
  END IF;
  
  IF p_target_role NOT IN ('client', 'staff_1', 'staff_2', 'admin') THEN
    RAISE EXCEPTION 'invalid role type';
  END IF;

  -- Cross-Tenant Hijack Guard
  SELECT organization_id INTO v_user_org_id
  FROM public.profiles WHERE id = p_user_id;

  IF v_user_org_id IS NOT NULL AND v_user_org_id != v_org_id THEN
    RAISE EXCEPTION 'User is currently employed by another dive organization and cannot be escalated. They can only be added as a local Client.';
  END IF;

  SELECT email, raw_user_meta_data->>'first_name', raw_user_meta_data->>'last_name'
  INTO v_user_email, v_first_name, v_last_name
  FROM auth.users WHERE id = p_user_id;

  -- Bypass trigger
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- Update Role & Lock OR Free them if demoted to Client
  UPDATE public.profiles
  SET 
    role = p_target_role::public.user_role,
    organization_id = CASE WHEN p_target_role = 'client' THEN NULL ELSE v_org_id END
  WHERE id = p_user_id;

  -- Scaffold local client container if missing
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE user_id = p_user_id AND organization_id = v_org_id) THEN
    INSERT INTO public.clients (user_id, email, first_name, last_name, organization_id)
    VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id);
  END IF;

  -- Assign to local Staff roster
  IF p_target_role IN ('staff_1', 'staff_2', 'admin') THEN
    INSERT INTO public.staff (user_id, email, first_name, last_name, organization_id)
    VALUES (p_user_id, v_user_email, COALESCE(v_first_name, 'Unknown'), COALESCE(v_last_name, 'Unknown'), v_org_id)
    ON CONFLICT (email) DO NOTHING;
  END IF;

END;
$$;


ALTER FUNCTION "public"."elevate_user_to_staff"("p_user_id" "uuid", "p_target_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_alerts"("p_org_id" "uuid") RETURNS TABLE("alert_type" "text", "severity" "text", "trip_id" "uuid", "trip_start" timestamp with time zone, "trip_label" "text", "client_id" "uuid", "client_name" "text", "message" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$

  -- missing_waiver: client has no waiver, trip starts within 2 days
  SELECT
    'missing_waiver'::text                                AS alert_type,
    'critical'::text                                      AS severity,
    t.id                                                  AS trip_id,
    t.start_time                                          AS trip_start,
    COALESCE(t.label, tt.name, 'Trip')                   AS trip_label,
    c.id                                                  AS client_id,
    c.first_name || ' ' || c.last_name                   AS client_name,
    'Missing waiver: ' || c.first_name || ' ' || c.last_name AS message
  FROM public.trip_clients tc
  JOIN public.trips t     ON t.id  = tc.trip_id
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  JOIN public.clients c   ON c.id  = tc.client_id
  WHERE t.organization_id = p_org_id
    AND tc.waiver         = false
    AND t.start_time      > now()
    AND t.start_time     <= now() + INTERVAL '2 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id      = p_org_id
        AND ar.alert_type  = 'missing_waiver'
        AND ar.trip_id     = t.id
        AND ar.client_id   = tc.client_id
    )

  UNION ALL

  -- missing_deposit: client has no deposit, trip starts within 7 days
  SELECT
    'missing_deposit'::text,
    'warning'::text,
    t.id,
    t.start_time,
    COALESCE(t.label, tt.name, 'Trip'),
    c.id,
    c.first_name || ' ' || c.last_name,
    'Missing deposit: ' || c.first_name || ' ' || c.last_name
  FROM public.trip_clients tc
  JOIN public.trips t     ON t.id  = tc.trip_id
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  JOIN public.clients c   ON c.id  = tc.client_id
  WHERE t.organization_id = p_org_id
    AND tc.deposit        = false
    AND t.start_time      > now()
    AND t.start_time     <= now() + INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id      = p_org_id
        AND ar.alert_type  = 'missing_deposit'
        AND ar.trip_id     = t.id
        AND ar.client_id   = tc.client_id
    )

  UNION ALL

  -- no_staff: trip starts within 7 days and has no trip_staff entries
  SELECT
    'no_staff'::text,
    'critical'::text,
    t.id,
    t.start_time,
    COALESCE(t.label, tt.name, 'Trip'),
    NULL::uuid,
    NULL::text,
    'No staff assigned to trip'
  FROM public.trips t
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  WHERE t.organization_id = p_org_id
    AND t.start_time      > now()
    AND t.start_time     <= now() + INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.trip_staff ts WHERE ts.trip_id = t.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id     = p_org_id
        AND ar.alert_type = 'no_staff'
        AND ar.trip_id    = t.id
    )

  UNION ALL

  -- staff_double_booked: staff has >= 2 daily jobs on same date + AM/PM block
  SELECT
    'staff_double_booked'::text,
    'warning'::text,
    NULL::uuid,
    j.job_date::timestamptz,
    'Multiple Assignments'::text,
    s.id,
    COALESCE(s.first_name || ' ' || s.last_name, 'Staff'),
    COALESCE(s.first_name, 'Staff') || ' double-booked on ' || j.job_date::text || ' (' || j."AM/PM" || ')'
  FROM public.staff_daily_job j
  JOIN public.staff s ON s.id = j.staff_id
  LEFT JOIN public.job_types jt ON jt.id = j.job_type_id
  WHERE j.organization_id = p_org_id
    AND j.job_date >= current_date
    AND jt.name != 'Unassigned'
  GROUP BY j.job_date, j."AM/PM", s.id, s.first_name, s.last_name
  HAVING count(*) > 1
    AND NOT EXISTS (
      SELECT 1 FROM public.alert_resolutions ar
      WHERE ar.org_id     = p_org_id
        AND ar.alert_type = 'staff_double_booked'
        AND ar.client_id  = s.id
        AND ar.notes      = (j.job_date::text || '_' || j."AM/PM")
    )

  ORDER BY trip_start ASC, alert_type ASC;

$$;


ALTER FUNCTION "public"."get_active_alerts"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_activity_logs"("p_org_id" "uuid", "p_entity_type" "text" DEFAULT NULL::"text", "p_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "action" "text", "entity_type" "text", "entity_id" "uuid", "metadata" "jsonb", "actor_name" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    al.id,
    al.action,
    al.entity_type,
    al.entity_id,
    al.metadata,
    COALESCE(s.first_name || ' ' || s.last_name, 'System') AS actor_name,
    al.created_at
  FROM public.activity_logs al
  LEFT JOIN public.staff s
    ON s.user_id = al.actor_auth_uid
   AND s.organization_id = al.organization_id
  WHERE al.organization_id = p_org_id
    -- Auth guard: caller must belong to this org
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND organization_id = p_org_id
    )
    AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND (p_from IS NULL OR al.created_at >= p_from)
    AND (p_to   IS NULL OR al.created_at <  p_to)
  ORDER BY al.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;


ALTER FUNCTION "public"."get_activity_logs"("p_org_id" "uuid", "p_entity_type" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_global_passport"("p_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."get_global_passport"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_overview_trips"("p_org_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("id" "uuid", "label" "text", "start_time" timestamp with time zone, "max_divers" integer, "entry_mode" "text", "vessel_id" "uuid", "vessel_name" "text", "vessel_abbreviation" "text", "trip_type_name" "text", "trip_type_abbreviation" "text", "trip_type_color" "text", "trip_type_category" "text", "trip_type_number_of_dives" integer, "booked_divers" bigint, "activity_counts" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    t.id,
    t.label,
    t.start_time,
    t.max_divers,
    t.entry_mode,
    t.vessel_id,
    v.name                AS vessel_name,
    v.abbreviation        AS vessel_abbreviation,
    tt.name               AS trip_type_name,
    tt.abbreviation       AS trip_type_abbreviation,
    tt.color              AS trip_type_color,
    tt.category           AS trip_type_category,
    tt.number_of_dives    AS trip_type_number_of_dives,

    -- Booked diver count (no need to send all UUIDs to the client)
    (
      SELECT COUNT(*)
      FROM public.trip_clients tc
      WHERE tc.trip_id = t.id
    ) AS booked_divers,

    -- Activity breakdown as compact JSON array
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'name',         a.name,
            'abbreviation', COALESCE(a.abbreviation, a.name),
            'count',        ac.cnt
          )
          ORDER BY a.name
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT activity_id, COUNT(*) AS cnt
        FROM public.trip_clients
        WHERE trip_id = t.id
          AND activity_id IS NOT NULL
        GROUP BY activity_id
      ) ac
      JOIN public.activities a ON a.id = ac.activity_id
    ) AS activity_counts

  FROM public.trips t
  LEFT JOIN public.vessels    v  ON v.id  = t.vessel_id
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  WHERE t.organization_id = p_org_id
    AND t.start_time      >= p_start
    AND t.start_time       < p_end
  ORDER BY t.start_time ASC;
$$;


ALTER FUNCTION "public"."get_overview_trips"("p_org_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_trip_client_visit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_requires_visit boolean;
  v_trip_date      date;
BEGIN
  SELECT requires_visit INTO v_requires_visit
  FROM public.clients WHERE id = NEW.client_id;

  IF NOT COALESCE(v_requires_visit, true) THEN
    RETURN NEW;
  END IF;

  SELECT start_time::date INTO v_trip_date
  FROM public.trips WHERE id = NEW.trip_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.visit_clients vc
    JOIN public.visits v ON v.id = vc.visit_id
    WHERE vc.client_id = NEW.client_id
      AND v.start_date <= v_trip_date
      AND v.end_date   >= v_trip_date
  ) THEN
    RAISE EXCEPTION
      'Client requires an active visit covering % to be added to a trip. Create a visit first, or mark the client as a local resident.',
      v_trip_date
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_trip_client_visit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_visit_deletion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pos_payments pp
    JOIN public.pos_invoices pi ON pi.id = pp.invoice_id
    WHERE pi.visit_id = OLD.id
      AND pp.voided_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot delete this visit: it has recorded payments. Void all payments first.'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."guard_visit_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_client_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.activity_logs (
    organization_id, actor_auth_uid, action, entity_type, entity_id, metadata
  ) VALUES (
    NEW.organization_id,
    auth.uid(),
    'registered_client',
    'client',
    NEW.id,
    jsonb_build_object(
      'client_name', NEW.first_name || ' ' || NEW.last_name
    )
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_client_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_staff_job_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_staff_name text;
  v_job_name   text;
  v_trip_label text;
  v_sdj_id     uuid;
  v_staff_id   uuid;
  v_job_id     uuid;
  v_org_id     uuid;
  v_trip_id    uuid;
  v_job_date   date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_sdj_id   := NEW.id;
    v_staff_id := NEW.staff_id;
    v_job_id   := NEW.job_type_id;
    v_org_id   := NEW.organization_id;
    v_trip_id  := NEW.trip_id;
    v_job_date := NEW.job_date;
  ELSE
    v_sdj_id   := OLD.id;
    v_staff_id := OLD.staff_id;
    v_job_id   := OLD.job_type_id;
    v_org_id   := OLD.organization_id;
    v_trip_id  := OLD.trip_id;
    v_job_date := OLD.job_date;
  END IF;

  -- Resolve job name; skip 'Unassigned' placeholder rows
  SELECT name INTO v_job_name FROM public.job_types WHERE id = v_job_id;
  IF v_job_name = 'Unassigned' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT first_name || ' ' || last_name INTO v_staff_name
  FROM public.staff WHERE id = v_staff_id;

  -- Optionally resolve trip label when job is linked to a trip
  IF v_trip_id IS NOT NULL THEN
    SELECT COALESCE(label, to_char(start_time AT TIME ZONE 'UTC', 'Mon DD HH24:MI'))
    INTO v_trip_label
    FROM public.trips WHERE id = v_trip_id;
  END IF;

  INSERT INTO public.activity_logs (
    organization_id, actor_auth_uid, action, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id,
    auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'assigned_staff' ELSE 'unassigned_staff' END,
    'staff_job',
    v_sdj_id,
    jsonb_build_object(
      'staff_name', v_staff_name,
      'job_name',   v_job_name,
      'job_date',   v_job_date,
      'trip_label', v_trip_label
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_staff_job_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_trip_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_org_id      uuid;
  v_id          uuid;
  v_label       text;
  v_start       timestamptz;
  v_type_id     uuid;
  v_vessel_id   uuid;
  v_trip_type   text;
  v_vessel      text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_org_id    := NEW.organization_id;
    v_id        := NEW.id;
    v_label     := NEW.label;
    v_start     := NEW.start_time;
    v_type_id   := NEW.trip_type_id;
    v_vessel_id := NEW.vessel_id;
  ELSE
    v_org_id    := OLD.organization_id;
    v_id        := OLD.id;
    v_label     := OLD.label;
    v_start     := OLD.start_time;
    v_type_id   := OLD.trip_type_id;
    v_vessel_id := OLD.vessel_id;
  END IF;

  SELECT name INTO v_trip_type FROM public.trip_types WHERE id = v_type_id;
  SELECT name INTO v_vessel    FROM public.vessels     WHERE id = v_vessel_id;

  INSERT INTO public.activity_logs (
    organization_id, actor_auth_uid, action, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id,
    auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'created_trip' ELSE 'deleted_trip' END,
    'trip',
    v_id,
    jsonb_build_object(
      'trip_label',  v_label,
      'trip_start',  v_start,
      'trip_type',   v_trip_type,
      'vessel_name', v_vessel
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_trip_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_trip_client_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_org_id      uuid;
  v_client_name text;
  v_trip_label  text;
  v_trip_start  timestamptz;
  v_client_id   uuid;
  v_trip_id     uuid;
  v_type_id     uuid;
  v_vessel_id   uuid;
  v_trip_type   text;
  v_vessel      text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_client_id := NEW.client_id;
    v_trip_id   := NEW.trip_id;
  ELSE
    v_client_id := OLD.client_id;
    v_trip_id   := OLD.trip_id;
  END IF;

  SELECT organization_id, start_time, label, trip_type_id, vessel_id
  INTO v_org_id, v_trip_start, v_trip_label, v_type_id, v_vessel_id
  FROM public.trips
  WHERE id = v_trip_id;

  -- Trip not found: it is being cascade-deleted in the same statement.
  -- The deleted_trip log entry from log_trip_change covers this case.
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT name INTO v_trip_type FROM public.trip_types WHERE id = v_type_id;
  SELECT name INTO v_vessel    FROM public.vessels     WHERE id = v_vessel_id;

  SELECT first_name || ' ' || last_name
  INTO v_client_name
  FROM public.clients
  WHERE id = v_client_id;

  INSERT INTO public.activity_logs (
    organization_id, actor_auth_uid, action, entity_type, entity_id, metadata
  ) VALUES (
    v_org_id,
    auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'added_to_trip' ELSE 'removed_from_trip' END,
    'trip_client',
    v_trip_id,
    jsonb_build_object(
      'client_id',   v_client_id,
      'client_name', v_client_name,
      'trip_label',  v_trip_label,
      'trip_start',  v_trip_start,
      'trip_type',   v_trip_type,
      'vessel_name', v_vessel
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_trip_client_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."my_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_profile_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
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


ALTER FUNCTION "public"."prevent_profile_escalation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean DEFAULT NULL::boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_visit_start date;
  v_visit_end   date;
BEGIN
  -- Auth guard
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trips t
    JOIN public.profiles p ON p.organization_id = t.organization_id
    WHERE t.id = p_current_trip_id
      AND p.id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'permission denied: you do not have access to this trip';
  END IF;

  -- Resolve the visit covering this trip date (for pick_up scoping)
  SELECT v.start_date, v.end_date
  INTO v_visit_start, v_visit_end
  FROM visit_clients vc
  JOIN visits v ON v.id = vc.visit_id
  WHERE vc.client_id = p_client_id
    AND v.start_date <= p_trip_date::date
    AND v.end_date   >= p_trip_date::date
  LIMIT 1;

  -- Equipment → all future trip_client rows for this client
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


CREATE OR REPLACE FUNCTION "public"."search_global_identities"("p_query" "text") RETURNS TABLE("id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "role" "text", "created_at" timestamp with time zone, "organization_id" "uuid", "is_local_client" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
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


ALTER FUNCTION "public"."search_global_identities"("p_query" "text") OWNER TO "postgres";


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
    "accept_certified_divers" boolean,
    "abbreviation" "text",
    "category" "text",
    "course" "uuid",
    "pos_product_id" "uuid"
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_auth_uid" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."activity_logs" IS 'Audit log of admin-visible actions across trips, clients, and staff.';



CREATE TABLE IF NOT EXISTS "public"."alert_resolutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "alert_type" "text" NOT NULL,
    "trip_id" "uuid",
    "client_id" "uuid",
    "resolved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_by" "uuid",
    "notes" "text"
);


ALTER TABLE "public"."alert_resolutions" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


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



CREATE TABLE IF NOT EXISTS "public"."client_deposits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "method" "text" NOT NULL,
    "note" "text",
    "recorded_by_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "voided" boolean DEFAULT false NOT NULL,
    "void_reason" "text",
    "voided_at" timestamp with time zone,
    CONSTRAINT "client_deposits_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."client_deposits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_dive_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_dive_id" "uuid" NOT NULL,
    "trip_client_id" "uuid" NOT NULL,
    "max_depth" numeric(5,1),
    "bottom_time" smallint
);


ALTER TABLE "public"."client_dive_logs" OWNER TO "postgres";


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
    "client_number" bigint NOT NULL,
    "requires_visit" boolean DEFAULT true NOT NULL
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
    "duration_days" integer,
    "min_age" integer,
    "prerequisites" "text",
    "description" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "Ratio" integer,
    "pos_product_id" "uuid",
    "included_trips" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deposit_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deposit_id" "uuid" NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "amount_applied" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deposit_applications_amount_applied_check" CHECK (("amount_applied" > (0)::numeric))
);


ALTER TABLE "public"."deposit_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."divesites" (
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


ALTER TABLE "public"."divesites" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."org_pos_config" (
    "organization_id" "uuid" NOT NULL,
    "private_instruction_product_id" "uuid",
    "rental_daily_cap" numeric(10,2)
);


ALTER TABLE "public"."org_pos_config" OWNER TO "postgres";


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
    "require_visit_for_trips" boolean DEFAULT false NOT NULL,
    CONSTRAINT "organizations_unit_system_check" CHECK (("unit_system" = ANY (ARRAY['metric'::"text", 'imperial'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_auto_item_waivers" (
    "visit_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "item_key" "text" NOT NULL
);


ALTER TABLE "public"."pos_auto_item_waivers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "pos_product_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "transaction_id" "uuid",
    CONSTRAINT "pos_invoice_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."pos_invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "visit_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_id" "uuid",
    CONSTRAINT "pos_invoices_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'partially_paid'::"text", 'paid'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."pos_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_parked_cart_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cart_id" "uuid" NOT NULL,
    "pos_product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pos_parked_cart_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."pos_parked_cart_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_parked_carts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "client_id" "uuid",
    "visit_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_parked_carts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "amount" numeric NOT NULL,
    "payment_method" "text" NOT NULL,
    "notes" "text",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "transaction_id" "uuid",
    "recorded_by_email" "text",
    "voided_at" timestamp with time zone,
    "void_reason" "text",
    "payment_group_id" "uuid",
    CONSTRAINT "pos_payments_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."pos_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "is_automated" boolean DEFAULT false NOT NULL,
    "price" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "stock" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "course_id" "uuid"
);


ALTER TABLE "public"."pos_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_rental_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "rental_field" "text" NOT NULL,
    "pos_product_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_rental_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recorded_by_email" "text"
);


ALTER TABLE "public"."pos_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."user_role" DEFAULT 'client'::"public"."user_role" NOT NULL,
    "organization_id" "uuid",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "phone" "text",
    "address_street" "text",
    "address_city" "text",
    "address_zip" "text",
    "address_country" "text",
    "emergency_contact_name" "text",
    "emergency_contact_phone" "text",
    "cert_organization" "text",
    "cert_level" "uuid",
    "cert_number" "text",
    "nitrox_cert_number" "text",
    "last_dive_date" "date"
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


CREATE TABLE IF NOT EXISTS "public"."staff_custom_job_card" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "job_date" "date" NOT NULL,
    "am_pm" "text" NOT NULL,
    "custom_label" "text" NOT NULL,
    "job_type_id" "uuid" NOT NULL,
    CONSTRAINT "staff_custom_job_card_am_pm_check" CHECK (("am_pm" = ANY (ARRAY['AM'::"text", 'PM'::"text"])))
);


ALTER TABLE "public"."staff_custom_job_card" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_daily_job" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "job_type_id" "uuid" NOT NULL,
    "job_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "AM/PM" "text",
    "trip_id" "uuid",
    "activity_id" "uuid",
    "custom_label" "text"
);


ALTER TABLE "public"."staff_daily_job" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_dive_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_dive_id" "uuid" NOT NULL,
    "trip_staff_id" "uuid" NOT NULL
);


ALTER TABLE "public"."staff_dive_logs" OWNER TO "postgres";


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
    "private" boolean DEFAULT false NOT NULL,
    "tank1" "text",
    "tank2" "text",
    "nitrox3" boolean,
    "nitrox_percentage3" integer,
    "tank3" boolean,
    "staff_assgined" "uuid"
);


ALTER TABLE "public"."trip_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_dives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "divesite_id" "uuid" NOT NULL,
    "dive_number" smallint NOT NULL,
    "started_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trip_dives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_pricing_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "trip_type_id" "uuid" NOT NULL,
    "min_qty" integer NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    CONSTRAINT "trip_pricing_tiers_min_qty_check" CHECK (("min_qty" >= 1)),
    CONSTRAINT "trip_pricing_tiers_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."trip_pricing_tiers" OWNER TO "postgres";


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
    "default_start_time_am" time without time zone NOT NULL,
    "number_of_dives" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "abbreviation" "text",
    "color" "text" DEFAULT 'blue'::"text",
    "category" "text",
    "pos_product_id" "uuid",
    "billing_via_activity" boolean DEFAULT false NOT NULL,
    "default_start_time_pm" time without time zone DEFAULT '13:00:00'::time without time zone NOT NULL
);


ALTER TABLE "public"."trip_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "label" "text",
    "entry_mode" "text",
    "start_time" timestamp with time zone NOT NULL,
    "duration_minutes" integer NOT NULL,
    "max_divers" integer NOT NULL,
    "dive_site_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "vessel_id" "uuid",
    "trip_type_id" "uuid",
    "series_id" "uuid"
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vessels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "abbreviation" "text",
    "need_captain" boolean,
    "capacity_dive" integer DEFAULT 12 NOT NULL,
    "capacity_snorkel" integer DEFAULT 12 NOT NULL
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


CREATE TABLE IF NOT EXISTS "public"."weekly_schedule_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "trip_type_id" "uuid" NOT NULL,
    "vessel_id" "uuid" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "valid_from" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "weekly_schedule_slots_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."weekly_schedule_slots" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_resolutions"
    ADD CONSTRAINT "alert_resolutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulk_inventory"
    ADD CONSTRAINT "bulk_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."client_deposits"
    ADD CONSTRAINT "client_deposits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_dive_logs"
    ADD CONSTRAINT "client_dive_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_dive_logs"
    ADD CONSTRAINT "client_dive_logs_unique" UNIQUE ("trip_dive_id", "trip_client_id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deposit_applications"
    ADD CONSTRAINT "deposit_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."divesites"
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



ALTER TABLE ONLY "public"."org_pos_config"
    ADD CONSTRAINT "org_pos_config_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_auto_item_waivers"
    ADD CONSTRAINT "pos_auto_item_waivers_pkey" PRIMARY KEY ("visit_id", "client_id", "item_key");



ALTER TABLE ONLY "public"."pos_categories"
    ADD CONSTRAINT "pos_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_invoice_items"
    ADD CONSTRAINT "pos_invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_invoices"
    ADD CONSTRAINT "pos_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_invoices"
    ADD CONSTRAINT "pos_invoices_visit_id_key" UNIQUE ("visit_id");



ALTER TABLE ONLY "public"."pos_parked_cart_items"
    ADD CONSTRAINT "pos_parked_cart_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_parked_carts"
    ADD CONSTRAINT "pos_parked_carts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_products"
    ADD CONSTRAINT "pos_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_rental_mappings"
    ADD CONSTRAINT "pos_rental_mappings_organization_id_rental_field_key" UNIQUE ("organization_id", "rental_field");



ALTER TABLE ONLY "public"."pos_rental_mappings"
    ADD CONSTRAINT "pos_rental_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_transactions"
    ADD CONSTRAINT "pos_transactions_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."staff_custom_job_card"
    ADD CONSTRAINT "staff_custom_job_card_organization_id_job_date_am_pm_custom_key" UNIQUE ("organization_id", "job_date", "am_pm", "custom_label");



ALTER TABLE ONLY "public"."staff_custom_job_card"
    ADD CONSTRAINT "staff_custom_job_card_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_daily_job"
    ADD CONSTRAINT "staff_daily_job_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_dive_logs"
    ADD CONSTRAINT "staff_dive_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_dive_logs"
    ADD CONSTRAINT "staff_dive_logs_unique" UNIQUE ("trip_dive_id", "trip_staff_id");



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



ALTER TABLE ONLY "public"."trip_dives"
    ADD CONSTRAINT "trip_dives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_dives"
    ADD CONSTRAINT "trip_dives_unique_slot" UNIQUE ("trip_id", "dive_number");



ALTER TABLE ONLY "public"."trip_pricing_tiers"
    ADD CONSTRAINT "trip_pricing_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_pricing_tiers"
    ADD CONSTRAINT "trip_pricing_tiers_trip_type_id_min_qty_key" UNIQUE ("trip_type_id", "min_qty");



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



ALTER TABLE ONLY "public"."weekly_schedule_slots"
    ADD CONSTRAINT "weekly_schedule_slots_organization_id_day_of_week_vessel_id_key" UNIQUE ("organization_id", "day_of_week", "vessel_id", "start_time", "valid_from");



ALTER TABLE ONLY "public"."weekly_schedule_slots"
    ADD CONSTRAINT "weekly_schedule_slots_pkey" PRIMARY KEY ("id");



CREATE INDEX "activity_logs_org_created" ON "public"."activity_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "activity_logs_org_type_created" ON "public"."activity_logs" USING "btree" ("organization_id", "entity_type", "created_at" DESC);



CREATE UNIQUE INDEX "bulk_inventory_org_category_size_idx" ON "public"."bulk_inventory" USING "btree" ("organization_id", "category_id", COALESCE("size", ''::"text"));



CREATE INDEX "idx_alert_resolutions_lookup" ON "public"."alert_resolutions" USING "btree" ("org_id", "alert_type", "trip_id", "client_id");



CREATE INDEX "idx_alert_resolutions_org" ON "public"."alert_resolutions" USING "btree" ("org_id");



CREATE INDEX "idx_bulk_inventory_category" ON "public"."bulk_inventory" USING "btree" ("category_id");



CREATE INDEX "idx_bulk_inventory_org" ON "public"."bulk_inventory" USING "btree" ("organization_id");



CREATE INDEX "idx_client_deposits_org_client" ON "public"."client_deposits" USING "btree" ("organization_id", "client_id");



CREATE INDEX "idx_clients_country" ON "public"."clients" USING "btree" ("address_country");



CREATE INDEX "idx_clients_email" ON "public"."clients" USING "btree" ("email");



CREATE INDEX "idx_clients_location" ON "public"."clients" USING "btree" ("location_id");



CREATE INDEX "idx_clients_org" ON "public"."clients" USING "btree" ("organization_id");



CREATE INDEX "idx_clients_user_id" ON "public"."clients" USING "btree" ("user_id");



CREATE INDEX "idx_deposit_applications_deposit" ON "public"."deposit_applications" USING "btree" ("deposit_id");



CREATE INDEX "idx_deposit_applications_payment" ON "public"."deposit_applications" USING "btree" ("payment_id");



CREATE INDEX "idx_dive_sites_location" ON "public"."divesites" USING "btree" ("location_id");



CREATE INDEX "idx_dive_sites_org" ON "public"."divesites" USING "btree" ("organization_id");



CREATE INDEX "idx_hotels_organization" ON "public"."hotels" USING "btree" ("organization_id");



CREATE INDEX "idx_inventory_category" ON "public"."inventory" USING "btree" ("category_id");



CREATE INDEX "idx_inventory_condition" ON "public"."inventory" USING "btree" ("condition");



CREATE INDEX "idx_inventory_location" ON "public"."inventory" USING "btree" ("location_id");



CREATE INDEX "idx_inventory_org" ON "public"."inventory" USING "btree" ("organization_id");



CREATE INDEX "idx_job_types_org" ON "public"."job_types" USING "btree" ("organization_id", "sort_order");



CREATE INDEX "idx_locations_organization" ON "public"."locations" USING "btree" ("organization_id");



CREATE INDEX "idx_pos_categories_org" ON "public"."pos_categories" USING "btree" ("organization_id");



CREATE INDEX "idx_pos_invoice_items_invoice" ON "public"."pos_invoice_items" USING "btree" ("invoice_id");



CREATE INDEX "idx_pos_invoices_client" ON "public"."pos_invoices" USING "btree" ("client_id");



CREATE INDEX "idx_pos_invoices_org" ON "public"."pos_invoices" USING "btree" ("organization_id");



CREATE INDEX "idx_pos_invoices_visit" ON "public"."pos_invoices" USING "btree" ("visit_id");



CREATE INDEX "idx_pos_parked_cart_items_cart" ON "public"."pos_parked_cart_items" USING "btree" ("cart_id");



CREATE INDEX "idx_pos_parked_carts_org" ON "public"."pos_parked_carts" USING "btree" ("organization_id");



CREATE INDEX "idx_pos_payments_invoice" ON "public"."pos_payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_pos_payments_voided" ON "public"."pos_payments" USING "btree" ("voided_at") WHERE ("voided_at" IS NULL);



CREATE INDEX "idx_pos_products_org" ON "public"."pos_products" USING "btree" ("organization_id");



CREATE INDEX "idx_pos_rental_mappings_org" ON "public"."pos_rental_mappings" USING "btree" ("organization_id");



CREATE INDEX "idx_pos_transactions_invoice" ON "public"."pos_transactions" USING "btree" ("invoice_id");



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



CREATE INDEX "idx_trips_series" ON "public"."trips" USING "btree" ("series_id") WHERE ("series_id" IS NOT NULL);



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



CREATE OR REPLACE TRIGGER "cascade_trip_removal_on_visit_client_delete" AFTER DELETE ON "public"."visit_clients" FOR EACH ROW EXECUTE FUNCTION "public"."cascade_trip_removal_on_visit_client_delete"();



CREATE OR REPLACE TRIGGER "cascade_trips_on_visit_delete" BEFORE DELETE ON "public"."visits" FOR EACH ROW EXECUTE FUNCTION "public"."cascade_trips_on_visit_delete"();



CREATE OR REPLACE TRIGGER "clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "courses_updated_at" BEFORE UPDATE ON "public"."courses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "dive_sites_updated_at" BEFORE UPDATE ON "public"."divesites" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "guard_trip_client_visit" BEFORE INSERT ON "public"."trip_clients" FOR EACH ROW EXECUTE FUNCTION "public"."guard_trip_client_visit"();



CREATE OR REPLACE TRIGGER "guard_visit_deletion" BEFORE DELETE ON "public"."visits" FOR EACH ROW EXECUTE FUNCTION "public"."guard_visit_deletion"();



CREATE OR REPLACE TRIGGER "hotels_updated_at" BEFORE UPDATE ON "public"."hotels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "inventory_updated_at" BEFORE UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "locations_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "staff_updated_at" BEFORE UPDATE ON "public"."staff" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_check_trip_capacity" BEFORE INSERT OR UPDATE ON "public"."trip_clients" FOR EACH ROW EXECUTE FUNCTION "public"."check_trip_capacity"();



CREATE OR REPLACE TRIGGER "trg_log_client" AFTER INSERT ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."log_client_insert"();



CREATE OR REPLACE TRIGGER "trg_log_staff_job" AFTER INSERT OR DELETE ON "public"."staff_daily_job" FOR EACH ROW EXECUTE FUNCTION "public"."log_staff_job_change"();



CREATE OR REPLACE TRIGGER "trg_log_trip" AFTER INSERT OR DELETE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."log_trip_change"();



CREATE OR REPLACE TRIGGER "trg_log_trip_client" AFTER INSERT OR DELETE ON "public"."trip_clients" FOR EACH ROW EXECUTE FUNCTION "public"."log_trip_client_change"();



CREATE OR REPLACE TRIGGER "trg_prevent_profile_escalation" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_profile_escalation"();



CREATE OR REPLACE TRIGGER "trip_types_updated_at" BEFORE UPDATE ON "public"."trip_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trips_updated_at" BEFORE UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trips_vessel_overlap_check" BEFORE INSERT OR UPDATE ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."check_vessel_overlap"();



CREATE OR REPLACE TRIGGER "vessels_updated_at" BEFORE UPDATE ON "public"."vessels" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "visits_updated_at" BEFORE UPDATE ON "public"."visits" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_category_fkey" FOREIGN KEY ("category") REFERENCES "public"."categories"("name") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pos_product_id_fkey" FOREIGN KEY ("pos_product_id") REFERENCES "public"."pos_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_resolutions"
    ADD CONSTRAINT "alert_resolutions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."staff"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bulk_inventory"
    ADD CONSTRAINT "bulk_inventory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulk_inventory"
    ADD CONSTRAINT "bulk_inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_deposits"
    ADD CONSTRAINT "client_deposits_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_deposits"
    ADD CONSTRAINT "client_deposits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_dive_logs"
    ADD CONSTRAINT "client_dive_logs_client_fk" FOREIGN KEY ("trip_client_id") REFERENCES "public"."trip_clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_dive_logs"
    ADD CONSTRAINT "client_dive_logs_dive_fk" FOREIGN KEY ("trip_dive_id") REFERENCES "public"."trip_dives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pos_product_id_fkey" FOREIGN KEY ("pos_product_id") REFERENCES "public"."pos_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deposit_applications"
    ADD CONSTRAINT "deposit_applications_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "public"."client_deposits"("id");



ALTER TABLE ONLY "public"."deposit_applications"
    ADD CONSTRAINT "deposit_applications_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."pos_payments"("id");



ALTER TABLE ONLY "public"."divesites"
    ADD CONSTRAINT "dive_sites_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."divesites"
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



ALTER TABLE ONLY "public"."org_pos_config"
    ADD CONSTRAINT "org_pos_config_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_pos_config"
    ADD CONSTRAINT "org_pos_config_private_instruction_product_id_fkey" FOREIGN KEY ("private_instruction_product_id") REFERENCES "public"."pos_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_auto_item_waivers"
    ADD CONSTRAINT "pos_auto_item_waivers_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_auto_item_waivers"
    ADD CONSTRAINT "pos_auto_item_waivers_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_categories"
    ADD CONSTRAINT "pos_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_invoice_items"
    ADD CONSTRAINT "pos_invoice_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_invoice_items"
    ADD CONSTRAINT "pos_invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."pos_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_invoice_items"
    ADD CONSTRAINT "pos_invoice_items_pos_product_id_fkey" FOREIGN KEY ("pos_product_id") REFERENCES "public"."pos_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_invoice_items"
    ADD CONSTRAINT "pos_invoice_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."pos_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_invoices"
    ADD CONSTRAINT "pos_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_invoices"
    ADD CONSTRAINT "pos_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_invoices"
    ADD CONSTRAINT "pos_invoices_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_parked_cart_items"
    ADD CONSTRAINT "pos_parked_cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "public"."pos_parked_carts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_parked_cart_items"
    ADD CONSTRAINT "pos_parked_cart_items_pos_product_id_fkey" FOREIGN KEY ("pos_product_id") REFERENCES "public"."pos_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pos_parked_carts"
    ADD CONSTRAINT "pos_parked_carts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_parked_carts"
    ADD CONSTRAINT "pos_parked_carts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_parked_carts"
    ADD CONSTRAINT "pos_parked_carts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_parked_carts"
    ADD CONSTRAINT "pos_parked_carts_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."pos_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."pos_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_products"
    ADD CONSTRAINT "pos_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."pos_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_products"
    ADD CONSTRAINT "pos_products_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pos_products"
    ADD CONSTRAINT "pos_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_rental_mappings"
    ADD CONSTRAINT "pos_rental_mappings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_rental_mappings"
    ADD CONSTRAINT "pos_rental_mappings_pos_product_id_fkey" FOREIGN KEY ("pos_product_id") REFERENCES "public"."pos_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pos_transactions"
    ADD CONSTRAINT "pos_transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."pos_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_cert_level_fkey" FOREIGN KEY ("cert_level") REFERENCES "public"."certification_levels"("id") ON DELETE SET NULL;



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



ALTER TABLE ONLY "public"."staff_dive_logs"
    ADD CONSTRAINT "staff_dive_logs_dive_fk" FOREIGN KEY ("trip_dive_id") REFERENCES "public"."trip_dives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_dive_logs"
    ADD CONSTRAINT "staff_dive_logs_staff_fk" FOREIGN KEY ("trip_staff_id") REFERENCES "public"."trip_staff"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."trip_dives"
    ADD CONSTRAINT "trip_dives_divesite_fk" FOREIGN KEY ("divesite_id") REFERENCES "public"."divesites"("id");



ALTER TABLE ONLY "public"."trip_dives"
    ADD CONSTRAINT "trip_dives_trip_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_pricing_tiers"
    ADD CONSTRAINT "trip_pricing_tiers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_pricing_tiers"
    ADD CONSTRAINT "trip_pricing_tiers_trip_type_id_fkey" FOREIGN KEY ("trip_type_id") REFERENCES "public"."trip_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_staff"
    ADD CONSTRAINT "trip_staff_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_types"
    ADD CONSTRAINT "trip_types_category_fkey" FOREIGN KEY ("category") REFERENCES "public"."categories"("name") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."trip_types"
    ADD CONSTRAINT "trip_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_types"
    ADD CONSTRAINT "trip_types_pos_product_id_fkey" FOREIGN KEY ("pos_product_id") REFERENCES "public"."pos_products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_dive_site_id_fkey" FOREIGN KEY ("dive_site_id") REFERENCES "public"."divesites"("id") ON DELETE SET NULL;



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



ALTER TABLE ONLY "public"."weekly_schedule_slots"
    ADD CONSTRAINT "weekly_schedule_slots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_schedule_slots"
    ADD CONSTRAINT "weekly_schedule_slots_trip_type_id_fkey" FOREIGN KEY ("trip_type_id") REFERENCES "public"."trip_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_schedule_slots"
    ADD CONSTRAINT "weekly_schedule_slots_vessel_id_fkey" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE CASCADE;



CREATE POLICY "Enable read/write for users based on organization_id" ON "public"."bulk_inventory" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_logs: select" ON "public"."activity_logs" FOR SELECT USING (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "admin_write_schedule_slots" ON "public"."weekly_schedule_slots" USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role"))))) WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "admins can update activities" ON "public"."activities" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "admins can update courses" ON "public"."courses" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



ALTER TABLE "public"."alert_resolutions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alert_resolutions: delete" ON "public"."alert_resolutions" FOR DELETE USING (("org_id" = "public"."my_org_id"()));



CREATE POLICY "alert_resolutions: insert" ON "public"."alert_resolutions" FOR INSERT WITH CHECK (("org_id" = "public"."my_org_id"()));



CREATE POLICY "alert_resolutions: select" ON "public"."alert_resolutions" FOR SELECT USING (("org_id" = "public"."my_org_id"()));



ALTER TABLE "public"."bulk_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."certification_levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."certification_organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_dive_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_dive_logs: org members" ON "public"."client_dive_logs" USING ((EXISTS ( SELECT 1
   FROM ("public"."trip_dives" "td"
     JOIN "public"."trips" "t" ON (("t"."id" = "td"."trip_id")))
  WHERE (("td"."id" = "client_dive_logs"."trip_dive_id") AND ("t"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."trip_dives" "td"
     JOIN "public"."trips" "t" ON (("t"."id" = "td"."trip_id")))
  WHERE (("td"."id" = "client_dive_logs"."trip_dive_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients: delete" ON "public"."clients" FOR DELETE USING (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "clients: insert" ON "public"."clients" FOR INSERT WITH CHECK (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "clients: select" ON "public"."clients" FOR SELECT USING ((("organization_id" = "public"."my_org_id"()) OR (("user_id" IS NOT NULL) AND ("public"."my_org_id"() IS NOT NULL)) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "clients: update by staff" ON "public"."clients" FOR UPDATE USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "clients: update own" ON "public"."clients" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."divesites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "divesites: org members" ON "public"."divesites" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."equipment_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hotels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hotels: org members" ON "public"."hotels" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory: org members" ON "public"."inventory" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."job_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_types: select" ON "public"."job_types" FOR SELECT USING ((("organization_id" IS NULL) OR ("organization_id" = "public"."my_org_id"())));



CREATE POLICY "job_types: write" ON "public"."job_types" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations: org members" ON "public"."locations" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "org admins can manage pos_categories" ON "public"."pos_categories" USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "org admins can manage pos_products" ON "public"."pos_products" USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "org admins can manage pos_rental_mappings" ON "public"."pos_rental_mappings" USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "org admins manage pos_invoice_items" ON "public"."pos_invoice_items" USING ((EXISTS ( SELECT 1
   FROM "public"."pos_invoices"
  WHERE (("pos_invoices"."id" = "pos_invoice_items"."invoice_id") AND ("pos_invoices"."organization_id" IN ( SELECT "profiles"."organization_id"
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role"))))))));



CREATE POLICY "org admins manage pos_invoices" ON "public"."pos_invoices" USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "org admins manage pos_payments" ON "public"."pos_payments" USING ((EXISTS ( SELECT 1
   FROM "public"."pos_invoices"
  WHERE (("pos_invoices"."id" = "pos_payments"."invoice_id") AND ("pos_invoices"."organization_id" IN ( SELECT "profiles"."organization_id"
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role"))))))));



CREATE POLICY "org admins manage pos_transactions" ON "public"."pos_transactions" USING ((EXISTS ( SELECT 1
   FROM "public"."pos_invoices"
  WHERE (("pos_invoices"."id" = "pos_transactions"."invoice_id") AND ("pos_invoices"."organization_id" IN ( SELECT "profiles"."organization_id"
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"public"."user_role"))))))));



CREATE POLICY "org members can manage custom job cards" ON "public"."staff_custom_job_card" TO "authenticated" USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))) WITH CHECK (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can manage item waivers" ON "public"."pos_auto_item_waivers" USING ((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "pos_auto_item_waivers"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "pos_auto_item_waivers"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "org members can manage pos config" ON "public"."org_pos_config" USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can manage pos_parked_cart_items" ON "public"."pos_parked_cart_items" USING (("cart_id" IN ( SELECT "pos_parked_carts"."id"
   FROM "public"."pos_parked_carts"
  WHERE ("pos_parked_carts"."organization_id" = "public"."my_org_id"()))));



CREATE POLICY "org members can manage pos_parked_carts" ON "public"."pos_parked_carts" USING (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "org members can view pos_categories" ON "public"."pos_categories" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can view pos_invoice_items" ON "public"."pos_invoice_items" FOR SELECT USING (("invoice_id" IN ( SELECT "pos_invoices"."id"
   FROM "public"."pos_invoices"
  WHERE ("pos_invoices"."organization_id" = "public"."my_org_id"()))));



CREATE POLICY "org members can view pos_invoices" ON "public"."pos_invoices" FOR SELECT USING (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "org members can view pos_parked_carts" ON "public"."pos_parked_carts" FOR SELECT USING (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "org members can view pos_payments" ON "public"."pos_payments" FOR SELECT USING (("invoice_id" IN ( SELECT "pos_invoices"."id"
   FROM "public"."pos_invoices"
  WHERE ("pos_invoices"."organization_id" = "public"."my_org_id"()))));



CREATE POLICY "org members can view pos_products" ON "public"."pos_products" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can view pos_rental_mappings" ON "public"."pos_rental_mappings" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "org members can view pos_transactions" ON "public"."pos_transactions" FOR SELECT USING (("invoice_id" IN ( SELECT "pos_invoices"."id"
   FROM "public"."pos_invoices"
  WHERE ("pos_invoices"."organization_id" = "public"."my_org_id"()))));



ALTER TABLE "public"."org_pos_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations: read own" ON "public"."organizations" FOR SELECT USING (("id" = "public"."my_org_id"()));



CREATE POLICY "organizations: update own" ON "public"."organizations" FOR UPDATE USING (("id" = "public"."my_org_id"())) WITH CHECK (("id" = "public"."my_org_id"()));



ALTER TABLE "public"."pos_auto_item_waivers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_invoice_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_parked_cart_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_parked_carts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_rental_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: read own" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles: read same org" ON "public"."profiles" FOR SELECT USING ((("public"."my_org_id"() IS NOT NULL) AND ("organization_id" = "public"."my_org_id"())));



CREATE POLICY "ref: select activities" ON "public"."activities" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select categories" ON "public"."categories" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select certification_levels" ON "public"."certification_levels" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select certification_organizations" ON "public"."certification_organizations" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select courses" ON "public"."courses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select equipment_categories" ON "public"."equipment_categories" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select roles" ON "public"."roles" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ref: select specialties" ON "public"."specialties" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."specialties" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff: org members" ON "public"."staff" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."staff_custom_job_card" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_daily_job" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_daily_job: org members" ON "public"."staff_daily_job" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."staff_dive_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_dive_logs: org members" ON "public"."staff_dive_logs" USING ((EXISTS ( SELECT 1
   FROM ("public"."trip_dives" "td"
     JOIN "public"."trips" "t" ON (("t"."id" = "td"."trip_id")))
  WHERE (("td"."id" = "staff_dive_logs"."trip_dive_id") AND ("t"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."trip_dives" "td"
     JOIN "public"."trips" "t" ON (("t"."id" = "td"."trip_id")))
  WHERE (("td"."id" = "staff_dive_logs"."trip_dive_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "staff_read_schedule_slots" ON "public"."weekly_schedule_slots" FOR SELECT USING (("organization_id" IN ( SELECT "profiles"."organization_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."staff_specialties" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_specialties: org members" ON "public"."staff_specialties" USING ((EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("s"."id" = "staff_specialties"."staff_id") AND ("s"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."staff" "s"
  WHERE (("s"."id" = "staff_specialties"."staff_id") AND ("s"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."trip_clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_clients: delete" ON "public"."trip_clients" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_clients"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "trip_clients: insert" ON "public"."trip_clients" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_clients"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "trip_clients: select" ON "public"."trip_clients" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_clients"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))) OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."user_id" = "auth"."uid"())))));



CREATE POLICY "trip_clients: update" ON "public"."trip_clients" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_clients"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_clients"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."trip_dives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_dives: org members" ON "public"."trip_dives" USING ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_dives"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_dives"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."trip_staff" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_staff: org members" ON "public"."trip_staff" USING ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_staff"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trips" "t"
  WHERE (("t"."id" = "trip_staff"."trip_id") AND ("t"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."trip_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_types: org members" ON "public"."trip_types" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trips: org members" ON "public"."trips" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."vessels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vessels: org members" ON "public"."vessels" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."visit_clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visit_clients: delete" ON "public"."visit_clients" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "visit_clients"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "visit_clients: insert" ON "public"."visit_clients" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "visit_clients"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "visit_clients: select" ON "public"."visit_clients" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "visit_clients"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"())))) OR ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."user_id" = "auth"."uid"())))));



CREATE POLICY "visit_clients: update" ON "public"."visit_clients" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "visit_clients"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."visits" "v"
  WHERE (("v"."id" = "visit_clients"."visit_id") AND ("v"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."visits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "visits: org members" ON "public"."visits" USING (("organization_id" = "public"."my_org_id"())) WITH CHECK (("organization_id" = "public"."my_org_id"()));



ALTER TABLE "public"."weekly_schedule_slots" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_client_to_organization"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_client_to_organization"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_client_to_organization"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_clients_to_trip"("p_trip_id" "uuid", "p_client_ids" "uuid"[], "p_trip_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_items_to_client_tab"("p_org_id" "uuid", "p_client_id" "uuid", "p_visit_id" "uuid", "p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."add_items_to_client_tab"("p_org_id" "uuid", "p_client_id" "uuid", "p_visit_id" "uuid", "p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_items_to_client_tab"("p_org_id" "uuid", "p_client_id" "uuid", "p_visit_id" "uuid", "p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_items_to_client_tab"("p_org_id" "uuid", "p_client_id" "uuid", "p_visit_id" "uuid", "p_items" "jsonb", "p_recorded_by" "uuid", "p_recorded_by_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_items_to_client_tab"("p_org_id" "uuid", "p_client_id" "uuid", "p_visit_id" "uuid", "p_items" "jsonb", "p_recorded_by" "uuid", "p_recorded_by_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_items_to_client_tab"("p_org_id" "uuid", "p_client_id" "uuid", "p_visit_id" "uuid", "p_items" "jsonb", "p_recorded_by" "uuid", "p_recorded_by_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_visit_invoice_payload"("p_visit_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_visit_invoice_payload"("p_visit_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_visit_invoice_payload"("p_visit_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cascade_trip_removal_on_visit_client_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."cascade_trip_removal_on_visit_client_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cascade_trip_removal_on_visit_client_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cascade_trips_on_visit_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."cascade_trips_on_visit_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cascade_trips_on_visit_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_trip_capacity"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_trip_capacity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_trip_capacity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_vessel_overlap"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_vessel_overlap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_vessel_overlap"() TO "service_role";



GRANT ALL ON FUNCTION "public"."checkout_session"("p_org_id" "uuid", "p_visit_id" "uuid", "p_invoice_id" "uuid", "p_client_id" "uuid", "p_items" "jsonb", "p_payment_amount" numeric, "p_payment_method" "text", "p_recorded_by" "uuid", "p_recorded_by_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."checkout_session"("p_org_id" "uuid", "p_visit_id" "uuid", "p_invoice_id" "uuid", "p_client_id" "uuid", "p_items" "jsonb", "p_payment_amount" numeric, "p_payment_method" "text", "p_recorded_by" "uuid", "p_recorded_by_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkout_session"("p_org_id" "uuid", "p_visit_id" "uuid", "p_invoice_id" "uuid", "p_client_id" "uuid", "p_items" "jsonb", "p_payment_amount" numeric, "p_payment_method" "text", "p_recorded_by" "uuid", "p_recorded_by_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_trip_series"("p_org_id" "uuid", "p_label" "text", "p_trip_type_id" "uuid", "p_entry_mode" "text", "p_duration_mins" integer, "p_max_divers" integer, "p_vessel_id" "uuid", "p_start_times" timestamp with time zone[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_trip_series"("p_org_id" "uuid", "p_label" "text", "p_trip_type_id" "uuid", "p_entry_mode" "text", "p_duration_mins" integer, "p_max_divers" integer, "p_vessel_id" "uuid", "p_start_times" timestamp with time zone[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_trip_series"("p_org_id" "uuid", "p_label" "text", "p_trip_type_id" "uuid", "p_entry_mode" "text", "p_duration_mins" integer, "p_max_divers" integer, "p_vessel_id" "uuid", "p_start_times" timestamp with time zone[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."elevate_user_to_staff"("p_user_id" "uuid", "p_target_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."elevate_user_to_staff"("p_user_id" "uuid", "p_target_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."elevate_user_to_staff"("p_user_id" "uuid", "p_target_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_alerts"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_alerts"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_alerts"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_activity_logs"("p_org_id" "uuid", "p_entity_type" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_activity_logs"("p_org_id" "uuid", "p_entity_type" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_activity_logs"("p_org_id" "uuid", "p_entity_type" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_global_passport"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_passport"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_passport"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_overview_trips"("p_org_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_overview_trips"("p_org_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_overview_trips"("p_org_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_trip_client_visit"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_trip_client_visit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_trip_client_visit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_visit_deletion"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_visit_deletion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_visit_deletion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_client_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_client_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_client_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_staff_job_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_staff_job_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_staff_job_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_trip_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_trip_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_trip_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_trip_client_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_trip_client_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_trip_client_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_profile_escalation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_profile_escalation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_profile_escalation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."propagate_trip_client_changes"("p_client_id" "uuid", "p_current_trip_id" "uuid", "p_trip_date" "text", "p_equipment" "jsonb", "p_pick_up" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_global_identities"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_global_identities"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_global_identities"("p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."alert_resolutions" TO "anon";
GRANT ALL ON TABLE "public"."alert_resolutions" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_resolutions" TO "service_role";



GRANT ALL ON TABLE "public"."bulk_inventory" TO "anon";
GRANT ALL ON TABLE "public"."bulk_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."bulk_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."certification_levels" TO "anon";
GRANT ALL ON TABLE "public"."certification_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."certification_levels" TO "service_role";



GRANT ALL ON TABLE "public"."certification_organizations" TO "anon";
GRANT ALL ON TABLE "public"."certification_organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."certification_organizations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."certification_organizations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."certification_organizations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."certification_organizations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."client_deposits" TO "anon";
GRANT ALL ON TABLE "public"."client_deposits" TO "authenticated";
GRANT ALL ON TABLE "public"."client_deposits" TO "service_role";



GRANT ALL ON TABLE "public"."client_dive_logs" TO "anon";
GRANT ALL ON TABLE "public"."client_dive_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."client_dive_logs" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clients_client_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clients_client_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clients_client_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."deposit_applications" TO "anon";
GRANT ALL ON TABLE "public"."deposit_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."deposit_applications" TO "service_role";



GRANT ALL ON TABLE "public"."divesites" TO "anon";
GRANT ALL ON TABLE "public"."divesites" TO "authenticated";
GRANT ALL ON TABLE "public"."divesites" TO "service_role";



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



GRANT ALL ON TABLE "public"."org_pos_config" TO "anon";
GRANT ALL ON TABLE "public"."org_pos_config" TO "authenticated";
GRANT ALL ON TABLE "public"."org_pos_config" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."pos_auto_item_waivers" TO "anon";
GRANT ALL ON TABLE "public"."pos_auto_item_waivers" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_auto_item_waivers" TO "service_role";



GRANT ALL ON TABLE "public"."pos_categories" TO "anon";
GRANT ALL ON TABLE "public"."pos_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_categories" TO "service_role";



GRANT ALL ON TABLE "public"."pos_invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."pos_invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."pos_invoices" TO "anon";
GRANT ALL ON TABLE "public"."pos_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."pos_parked_cart_items" TO "anon";
GRANT ALL ON TABLE "public"."pos_parked_cart_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_parked_cart_items" TO "service_role";



GRANT ALL ON TABLE "public"."pos_parked_carts" TO "anon";
GRANT ALL ON TABLE "public"."pos_parked_carts" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_parked_carts" TO "service_role";



GRANT ALL ON TABLE "public"."pos_payments" TO "anon";
GRANT ALL ON TABLE "public"."pos_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_payments" TO "service_role";



GRANT ALL ON TABLE "public"."pos_products" TO "anon";
GRANT ALL ON TABLE "public"."pos_products" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_products" TO "service_role";



GRANT ALL ON TABLE "public"."pos_rental_mappings" TO "anon";
GRANT ALL ON TABLE "public"."pos_rental_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_rental_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."pos_transactions" TO "anon";
GRANT ALL ON TABLE "public"."pos_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_transactions" TO "service_role";



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



GRANT ALL ON TABLE "public"."staff_custom_job_card" TO "anon";
GRANT ALL ON TABLE "public"."staff_custom_job_card" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_custom_job_card" TO "service_role";



GRANT ALL ON TABLE "public"."staff_daily_job" TO "anon";
GRANT ALL ON TABLE "public"."staff_daily_job" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_daily_job" TO "service_role";



GRANT ALL ON TABLE "public"."staff_dive_logs" TO "anon";
GRANT ALL ON TABLE "public"."staff_dive_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_dive_logs" TO "service_role";



GRANT ALL ON TABLE "public"."staff_specialties" TO "anon";
GRANT ALL ON TABLE "public"."staff_specialties" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_specialties" TO "service_role";



GRANT ALL ON TABLE "public"."trip_clients" TO "anon";
GRANT ALL ON TABLE "public"."trip_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_clients" TO "service_role";



GRANT ALL ON TABLE "public"."trip_dives" TO "anon";
GRANT ALL ON TABLE "public"."trip_dives" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_dives" TO "service_role";



GRANT ALL ON TABLE "public"."trip_pricing_tiers" TO "anon";
GRANT ALL ON TABLE "public"."trip_pricing_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_pricing_tiers" TO "service_role";



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



GRANT ALL ON TABLE "public"."weekly_schedule_slots" TO "anon";
GRANT ALL ON TABLE "public"."weekly_schedule_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_schedule_slots" TO "service_role";



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







