-- Atomic checkout RPCs
-- Replaces the multi-step client-side sequences in pos/sell/actions.ts with
-- single transactional Postgres functions so that no partial state can be
-- persisted if a network call fails mid-way.
--
-- Two RPCs:
--   checkout_session       — sell terminal: find/create invoice + transaction
--                            + items + optional payment, all in one shot
--   add_items_to_client_tab — tab flow: find/create invoice + insert items
--                             (no payment, no transaction record)

-- ── 1. checkout_session ───────────────────────────────────────────────────────
--
-- p_items JSON shape: [{"product_id": "<uuid>", "price": 9.99, "qty": 1}, ...]
--
CREATE OR REPLACE FUNCTION public.checkout_session(
  p_org_id             uuid,
  p_visit_id           uuid,          -- NULL for walk-in terminal sales
  p_invoice_id         uuid,          -- pass existing id to skip lookup
  p_client_id          uuid,          -- NULL for group / unassigned
  p_items              jsonb,         -- array of {product_id, price, qty}
  p_payment_amount     numeric,       -- 0 or NULL if no payment this call
  p_payment_method     text,          -- 'cash' | 'card' | etc.
  p_recorded_by        uuid,
  p_recorded_by_email  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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


-- ── 2. add_items_to_client_tab ────────────────────────────────────────────────
--
-- Adds items to a client's invoice without a transaction record or payment.
-- Used by the "Add to tab" flow from the sell terminal.
--
-- p_items JSON shape: same as checkout_session
--
CREATE OR REPLACE FUNCTION public.add_items_to_client_tab(
  p_org_id     uuid,
  p_client_id  uuid,
  p_visit_id   uuid,    -- NULL for client-only (no visit) tabs
  p_items      jsonb    -- array of {product_id, price, qty}
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
