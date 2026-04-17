-- Fix course trip waiver: the client_included_trips CTE was using the old
-- join direction (courses.pos_product_id) instead of the new one
-- (pos_products.course_id introduced in 20260411190000_product_course_link.sql).
-- This caused zero trips to be waived for any course-linked product.

CREATE OR REPLACE FUNCTION public.calculate_visit_invoice_payload(p_visit_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Read rental cap from the new sidecar table
  SELECT rental_daily_cap INTO v_rental_daily_cap
  FROM   public.org_pos_config WHERE organization_id = v_org_id;

  WITH visit_clients_list AS (
    SELECT c.id AS client_id,
           c.first_name || ' ' || c.last_name AS client_name
    FROM   public.visit_clients vc
    JOIN   public.clients c ON c.id = vc.client_id
    WHERE  vc.visit_id = p_visit_id
  ),

  -- ── Trips included by courses added to the tab ────────────────────────────
  -- Waiver only activates once the course product is on the invoice.
  client_included_trips AS (
    SELECT pii.client_id,
           COALESCE(SUM(c.included_trips), 0) AS total_included_trips
    FROM   public.pos_invoice_items pii
    JOIN   public.pos_products      pp ON pp.id  = pii.pos_product_id
    JOIN   public.courses           c  ON c.id   = pp.course_id
    WHERE  pii.invoice_id = v_invoice_id
    GROUP  BY pii.client_id
  ),

  -- ── Trip count per (client, trip_type) for retroactive tier lookup ────────
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

  -- ── Resolve tier price per (client, trip_type) ────────────────────────────
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

  -- ── All chargeable trips ordered chronologically ──────────────────────────
  client_trips_windowed AS (
    SELECT tc.client_id,
           t.id          AS trip_id,
           t.start_time,
           pp.name       AS product_name,
           COALESCE(ctp.tier_price, pp.price) AS effective_price,
           ROW_NUMBER() OVER (
             PARTITION BY tc.client_id
             ORDER BY t.start_time
           ) AS trip_number
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

  -- ── Per-day rental: one row per (client, day, gear_type) ─────────────────
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

    -- ① Trip charges: waive the first N trips once the course is on the tab
    SELECT ctw.client_id,
           jsonb_build_object(
             'name',      ctw.product_name,
             'price',     ctw.effective_price,
             'type',      'trip',
             'trip_id',   ctw.trip_id,
             'trip_date', ctw.start_time
           ) AS item,
           ctw.effective_price AS price_num
    FROM   client_trips_windowed ctw
    LEFT   JOIN client_included_trips cit ON cit.client_id = ctw.client_id
    WHERE  ctw.trip_number > COALESCE(cit.total_included_trips, 0)

    UNION ALL

    -- ② Private guide fee — read product via org_pos_config
    SELECT tc.client_id,
           jsonb_build_object(
             'name',      pp.name,
             'price',     pp.price,
             'type',      'private_guide',
             'trip_id',   t.id,
             'trip_date', t.start_time
           ) AS item,
           pp.price AS price_num
    FROM   public.trip_clients  tc
    JOIN   public.trips         t   ON t.id  = tc.trip_id
    JOIN   public.org_pos_config opc ON opc.organization_id = v_org_id
    JOIN   public.pos_products  pp  ON pp.id = opc.private_instruction_product_id
    WHERE  tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND  t.start_time::date BETWEEN v_visit_start AND v_visit_end
      AND  tc.private = true

    UNION ALL

    -- ③ Rental (uncapped): one line per gear piece, e.g. "Mask Rental"
    SELECT dri.client_id,
           jsonb_build_object(
             'name',      dri.name || ' Rental',
             'price',     dri.price,
             'type',      'rental',
             'trip_date', dri.trip_date::timestamptz
           ) AS item,
           dri.price AS price_num
    FROM   daily_rental_items dri
    JOIN   daily_rental_totals drt
           ON  drt.client_id = dri.client_id
           AND drt.trip_date = dri.trip_date
    WHERE  drt.raw_total <= drt.charged_amount

    UNION ALL

    -- ④ Rental (capped): single collapsed line at cap price
    SELECT drt.client_id,
           jsonb_build_object(
             'name',      'Full Rental Gear',
             'price',     drt.charged_amount,
             'type',      'rental',
             'trip_date', drt.trip_date::timestamptz
           ) AS item,
           drt.charged_amount AS price_num
    FROM   daily_rental_totals drt
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
             (SELECT jsonb_agg(jsonb_build_object('name', pp.name, 'price', pii.unit_price, 'qty', pii.quantity))
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
