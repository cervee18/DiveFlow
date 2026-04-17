-- Allow trip types to delegate billing to the activity on the trip_client row.
-- When billing_via_activity = true:
--   • The trip-type price is NOT charged (even if pos_product_id is set)
--   • The activity assigned on trip_clients IS charged (as before)
-- This avoids double-charging for "Class" / "Pool" type trips.

ALTER TABLE public.trip_types
  ADD COLUMN IF NOT EXISTS billing_via_activity boolean NOT NULL DEFAULT false;

-- Rebuild the automated billing RPC to respect the new flag.
CREATE OR REPLACE FUNCTION public.calculate_visit_invoice_payload(p_visit_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_status text := 'open';
  v_invoice_id uuid := null;
  v_visit_start date;
  v_visit_end date;
  v_clients jsonb;
  v_shared_group_items jsonb;
  v_unassigned_payments jsonb;
  v_master_subtotal numeric := 0;
  v_master_paid numeric := 0;
  v_master_balance numeric := 0;
  v_result json;
BEGIN
  SELECT start_date, end_date INTO v_visit_start, v_visit_end
  FROM public.visits WHERE id = p_visit_id;

  SELECT id, status INTO v_invoice_id, v_invoice_status
  FROM public.pos_invoices WHERE visit_id = p_visit_id LIMIT 1;

  WITH visit_clients_list AS (
    SELECT c.id AS client_id, c.first_name || ' ' || c.last_name AS client_name
    FROM public.visit_clients vc
    JOIN public.clients c ON c.id = vc.client_id
    WHERE vc.visit_id = p_visit_id
  ),
  automated_trip_items AS (
    -- Trip type charge — skipped when billing_via_activity = true
    SELECT
      tc.client_id,
      jsonb_build_object('name', pp.name, 'price', pp.price, 'type', 'trip', 'trip_id', t.id, 'trip_date', t.start_time) AS item,
      pp.price AS price_num
    FROM public.trip_clients tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.trip_types tt ON tt.id = t.trip_type_id
    JOIN public.pos_products pp ON pp.id = tt.pos_product_id
    WHERE tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND t.start_time::date >= v_visit_start
      AND t.start_time::date <= v_visit_end
      AND tt.billing_via_activity = false   -- key guard

    UNION ALL
    -- Activity charge (always fires when activity_id is set on trip_client)
    SELECT
      tc.client_id,
      jsonb_build_object('name', pp.name, 'price', pp.price, 'type', 'activity', 'trip_id', t.id, 'trip_date', t.start_time) AS item,
      pp.price AS price_num
    FROM public.trip_clients tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.activities a ON a.id = tc.activity_id
    JOIN public.pos_products pp ON pp.id = a.pos_product_id
    WHERE tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND t.start_time::date >= v_visit_start
      AND t.start_time::date <= v_visit_end

    UNION ALL
    -- Course charge
    SELECT
      tc.client_id,
      jsonb_build_object('name', pp.name, 'price', pp.price, 'type', 'course', 'trip_id', t.id, 'trip_date', t.start_time) AS item,
      pp.price AS price_num
    FROM public.trip_clients tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.courses c ON c.id = tc.course_id
    JOIN public.pos_products pp ON pp.id = c.pos_product_id
    WHERE tc.client_id IN (SELECT client_id FROM visit_clients_list)
      AND t.start_time::date >= v_visit_start
      AND t.start_time::date <= v_visit_end

    UNION ALL
    -- Rental gear charge
    SELECT
      tc.client_id,
      jsonb_build_object('name', pp.name, 'price', pp.price, 'type', 'rental', 'trip_id', t.id, 'trip_date', t.start_time) AS item,
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
        (frm.rental_field = 'bcd'       AND tc.bcd IS NOT NULL AND tc.bcd != '') OR
        (frm.rental_field = 'regulator' AND tc.regulator = true) OR
        (frm.rental_field = 'wetsuit'   AND tc.wetsuit IS NOT NULL AND tc.wetsuit != '') OR
        (frm.rental_field = 'computer'  AND tc.computer = true) OR
        (frm.rental_field = 'nitrox'    AND tc.nitrox1 = true)
      )
  ),
  client_aggs AS (
    SELECT
      vcl.client_id,
      vcl.client_name,
      COALESCE((SELECT jsonb_agg(item) FROM automated_trip_items ati WHERE ati.client_id = vcl.client_id), '[]'::jsonb) AS automated_items,
      COALESCE((SELECT sum(price_num) FROM automated_trip_items ati WHERE ati.client_id = vcl.client_id), 0) AS auto_subtotal,
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('name', pp.name, 'price', pii.unit_price, 'qty', pii.quantity))
         FROM public.pos_invoice_items pii
         JOIN public.pos_products pp ON pp.id = pii.pos_product_id
         WHERE pii.invoice_id = v_invoice_id AND pii.client_id = vcl.client_id), '[]'::jsonb
      ) AS manual_items,
      COALESCE((SELECT sum(pii.unit_price * pii.quantity) FROM public.pos_invoice_items pii WHERE pii.invoice_id = v_invoice_id AND pii.client_id = vcl.client_id), 0) AS manual_subtotal,
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
      'client_name', client_name,
      'automated_items', automated_items,
      'manual_items', manual_items,
      'payments', payments,
      'totals', jsonb_build_object(
        'subtotal', auto_subtotal + manual_subtotal,
        'paid', paid_total,
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
    COALESCE(SUM((val->'totals'->>'paid')::numeric), 0)
  INTO v_master_subtotal, v_master_paid
  FROM jsonb_each(v_clients) AS t(key, val);

  v_master_subtotal := v_master_subtotal + COALESCE(
    (SELECT sum(unit_price * quantity) FROM public.pos_invoice_items WHERE invoice_id = v_invoice_id AND client_id IS NULL), 0);
  v_master_paid := v_master_paid + COALESCE(
    (SELECT sum(amount) FROM public.pos_payments WHERE invoice_id = v_invoice_id AND client_id IS NULL AND voided_at IS NULL), 0);
  v_master_balance := v_master_subtotal - v_master_paid;

  v_result := jsonb_build_object(
    'visit_id',            p_visit_id,
    'invoice_id',          v_invoice_id,
    'status',              COALESCE(v_invoice_status, 'open'),
    'clients',             v_clients,
    'shared_group_items',  COALESCE(v_shared_group_items, '[]'::jsonb),
    'unassigned_payments', COALESCE(v_unassigned_payments, '[]'::jsonb),
    'grand_totals',        jsonb_build_object(
      'master_subtotal', v_master_subtotal,
      'master_paid',     v_master_paid,
      'master_balance',  v_master_balance
    )
  );

  RETURN v_result;
END;
$$;
