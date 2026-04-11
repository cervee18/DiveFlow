-- ── Fix trip exclusion logic ───────────────────────────────────────────────────
-- Old: private = true trips were excluded from the trip charge (wrong —
--      private divers pay both the trip and the guide fee).
-- New: trips are excluded from automated charges only when activity_id IS NOT NULL.
--      If a client has any activity assigned on that trip, the fee is handled
--      manually at the checkout terminal. Everything else is charged normally.
--
-- private = true  → trip charge + private guide fee (auto)
-- activity_id set → NO trip charge, NO auto fee (terminal only)
-- normal trip     → trip charge only (auto)

CREATE OR REPLACE FUNCTION public.calculate_visit_invoice_payload(p_visit_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_status text := 'open';
  v_invoice_id     uuid := null;
  v_visit_start    date;
  v_visit_end      date;
  v_org_id         uuid;
  v_clients        jsonb;
  v_shared_group_items  jsonb;
  v_unassigned_payments jsonb;
  v_master_subtotal numeric := 0;
  v_master_paid     numeric := 0;
  v_master_balance  numeric := 0;
  v_result          json;
BEGIN
  SELECT v.start_date, v.end_date, v.organization_id
  INTO   v_visit_start, v_visit_end, v_org_id
  FROM   public.visits v WHERE v.id = p_visit_id;

  SELECT id, status INTO v_invoice_id, v_invoice_status
  FROM public.pos_invoices WHERE visit_id = p_visit_id LIMIT 1;

  WITH visit_clients_list AS (
    SELECT c.id AS client_id, c.first_name || ' ' || c.last_name AS client_name
    FROM public.visit_clients vc
    JOIN public.clients c ON c.id = vc.client_id
    WHERE vc.visit_id = p_visit_id
  ),

  -- ── Tank budget covered by courses added at the checkout terminal ─────────
  client_included_dives AS (
    SELECT
      pii.client_id,
      COALESCE(SUM(c.included_dives), 0) AS total_included_dives
    FROM public.pos_invoice_items pii
    JOIN public.courses c ON c.pos_product_id = pii.pos_product_id
    WHERE pii.invoice_id = v_invoice_id
    GROUP BY pii.client_id
  ),

  -- ── Trips eligible for automated charging ────────────────────────────────
  -- Excluded when activity_id IS NOT NULL — those trips are handled at terminal.
  -- private = true trips ARE included here (they pay trip + guide fee).
  client_trips_windowed AS (
    SELECT
      tc.client_id,
      t.id           AS trip_id,
      t.start_time,
      tt.tanks_count,
      pp.name        AS product_name,
      pp.price,
      COALESCE(
        SUM(tt.tanks_count) OVER (
          PARTITION BY tc.client_id
          ORDER BY t.start_time
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0
      ) AS prev_cumulative_tanks
    FROM public.trip_clients tc
    JOIN public.trips        t  ON t.id  = tc.trip_id
    JOIN public.trip_types   tt ON tt.id = t.trip_type_id
    JOIN public.pos_products pp ON pp.id = tt.pos_product_id
    WHERE tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND t.start_time::date >= v_visit_start
      AND t.start_time::date <= v_visit_end
      AND tt.billing_via_activity = false
      AND tc.activity_id IS NULL          -- activity trips → terminal only
      AND tt.pos_product_id IS NOT NULL
  ),

  automated_items AS (

    -- ① Trip charge with course-tank waiver
    --   Trips are waived chronologically until the course's included_dives budget
    --   is exhausted. Boundary trips are charged pro-rated.
    SELECT
      ctw.client_id,
      jsonb_build_object(
        'name',      ctw.product_name,
        'price',     ROUND(
                       ctw.price
                       * (ctw.tanks_count
                          - LEAST(ctw.tanks_count,
                              GREATEST(0,
                                COALESCE(cid.total_included_dives, 0)
                                - ctw.prev_cumulative_tanks)))::numeric
                       / ctw.tanks_count,
                     2),
        'type',      'trip',
        'trip_id',   ctw.trip_id,
        'trip_date', ctw.start_time
      ) AS item,
      ROUND(
        ctw.price
        * (ctw.tanks_count
           - LEAST(ctw.tanks_count,
               GREATEST(0,
                 COALESCE(cid.total_included_dives, 0)
                 - ctw.prev_cumulative_tanks)))::numeric
        / ctw.tanks_count,
      2) AS price_num
    FROM client_trips_windowed ctw
    LEFT JOIN client_included_dives cid ON cid.client_id = ctw.client_id
    WHERE ctw.prev_cumulative_tanks + ctw.tanks_count
          > COALESCE(cid.total_included_dives, 0)

    UNION ALL

    -- ② Private guide fee — one per trip where private = true
    --   The trip charge (above) is ALSO applied for private trips.
    SELECT
      tc.client_id,
      jsonb_build_object(
        'name',      pp.name,
        'price',     pp.price,
        'type',      'private_guide',
        'trip_id',   t.id,
        'trip_date', t.start_time
      ) AS item,
      pp.price AS price_num
    FROM public.trip_clients tc
    JOIN public.trips         t   ON t.id  = tc.trip_id
    JOIN public.organizations org ON org.id = v_org_id
    JOIN public.pos_products  pp  ON pp.id  = org.private_instruction_product_id
    WHERE tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND t.start_time::date >= v_visit_start
      AND t.start_time::date <= v_visit_end
      AND tc.private = true

    UNION ALL

    -- ③ Rental gear charge (unchanged)
    SELECT
      tc.client_id,
      jsonb_build_object(
        'name',      pp.name,
        'price',     pp.price,
        'type',      'rental',
        'trip_id',   t.id,
        'trip_date', t.start_time
      ) AS item,
      pp.price AS price_num
    FROM public.trip_clients tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.pos_rental_mappings frm ON frm.organization_id = t.organization_id
    JOIN public.pos_products pp ON pp.id = frm.pos_product_id
    WHERE tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND t.start_time::date >= v_visit_start
      AND t.start_time::date <= v_visit_end
      AND (
        (frm.rental_field = 'mask'      AND tc.mask IS NOT NULL AND tc.mask != '') OR
        (frm.rental_field = 'fins'      AND tc.fins IS NOT NULL AND tc.fins != '') OR
        (frm.rental_field = 'bcd'       AND tc.bcd  IS NOT NULL AND tc.bcd  != '') OR
        (frm.rental_field = 'regulator' AND tc.regulator = true) OR
        (frm.rental_field = 'wetsuit'   AND tc.wetsuit IS NOT NULL AND tc.wetsuit != '') OR
        (frm.rental_field = 'computer'  AND tc.computer = true) OR
        (frm.rental_field = 'nitrox'    AND tc.nitrox1  = true)
      )
  ),

  client_aggs AS (
    SELECT
      vcl.client_id,
      vcl.client_name,
      COALESCE((SELECT jsonb_agg(item)   FROM automated_items ai WHERE ai.client_id = vcl.client_id), '[]'::jsonb) AS automated_items,
      COALESCE((SELECT sum(price_num)    FROM automated_items ai WHERE ai.client_id = vcl.client_id), 0)           AS auto_subtotal,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('name', pp.name, 'price', pii.unit_price, 'qty', pii.quantity))
         FROM public.pos_invoice_items pii
         JOIN public.pos_products pp ON pp.id = pii.pos_product_id
         WHERE pii.invoice_id = v_invoice_id AND pii.client_id = vcl.client_id), '[]'::jsonb
      ) AS manual_items,
      COALESCE((SELECT sum(pii.unit_price * pii.quantity)
                FROM public.pos_invoice_items pii
                WHERE pii.invoice_id = v_invoice_id AND pii.client_id = vcl.client_id), 0) AS manual_subtotal,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('date', ppay.created_at, 'amount', ppay.amount, 'method', ppay.payment_method))
         FROM public.pos_payments ppay
         WHERE ppay.invoice_id = v_invoice_id
           AND ppay.client_id = vcl.client_id
           AND ppay.voided_at IS NULL), '[]'::jsonb
      ) AS payments,
      COALESCE(
        (SELECT sum(ppay.amount)
         FROM public.pos_payments ppay
         WHERE ppay.invoice_id = v_invoice_id
           AND ppay.client_id = vcl.client_id
           AND ppay.voided_at IS NULL), 0
      ) AS paid_total
    FROM visit_clients_list vcl
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
    jsonb_agg(jsonb_build_object('name', pp.name, 'price', pii.unit_price, 'qty', pii.quantity)), '[]'::jsonb
  ) INTO v_shared_group_items
  FROM public.pos_invoice_items pii
  JOIN public.pos_products pp ON pp.id = pii.pos_product_id
  WHERE pii.invoice_id = v_invoice_id AND pii.client_id IS NULL;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('date', ppay.created_at, 'amount', ppay.amount, 'method', ppay.payment_method)), '[]'::jsonb
  ) INTO v_unassigned_payments
  FROM public.pos_payments ppay
  WHERE ppay.invoice_id = v_invoice_id
    AND ppay.client_id IS NULL
    AND ppay.voided_at IS NULL;

  SELECT
    COALESCE(SUM((val->'totals'->>'subtotal')::numeric), 0),
    COALESCE(SUM((val->'totals'->>'paid')::numeric),     0)
  INTO v_master_subtotal, v_master_paid
  FROM jsonb_each(v_clients) AS t(key, val);

  v_master_subtotal := v_master_subtotal + COALESCE(
    (SELECT sum(unit_price * quantity) FROM public.pos_invoice_items
     WHERE invoice_id = v_invoice_id AND client_id IS NULL), 0);
  v_master_paid := v_master_paid + COALESCE(
    (SELECT sum(amount) FROM public.pos_payments
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
