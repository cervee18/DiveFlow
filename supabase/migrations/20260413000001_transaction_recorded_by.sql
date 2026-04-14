-- Track who triggered each transaction (checkout or add-to-tab).
-- Also updates add_items_to_client_tab to create a transaction record per call,
-- consistent with checkout_session, so the recorder is always captured.

ALTER TABLE public.pos_transactions
  ADD COLUMN IF NOT EXISTS recorded_by_email text;

-- ── Updated add_items_to_client_tab ──────────────────────────────────────────
-- Now accepts p_recorded_by / p_recorded_by_email, creates a pos_transactions
-- row per call, and links all inserted items to it.
CREATE OR REPLACE FUNCTION public.add_items_to_client_tab(
  p_org_id             uuid,
  p_client_id          uuid,
  p_visit_id           uuid,
  p_items              jsonb,
  p_recorded_by        uuid    DEFAULT NULL,
  p_recorded_by_email  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
