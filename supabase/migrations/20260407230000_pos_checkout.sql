-- 1. Create Invoices Table
CREATE TABLE IF NOT EXISTS public.pos_invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL UNIQUE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partially_paid', 'paid', 'void')),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_pos_invoices_org ON public.pos_invoices(organization_id);
CREATE INDEX idx_pos_invoices_visit ON public.pos_invoices(visit_id);

ALTER TABLE public.pos_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view pos_invoices" ON public.pos_invoices FOR SELECT USING (organization_id = public.my_org_id());
CREATE POLICY "org admins manage pos_invoices" ON public.pos_invoices FOR ALL USING (
  organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 2. Create Invoice Items Table
CREATE TABLE IF NOT EXISTS public.pos_invoice_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid REFERENCES public.pos_invoices(id) ON DELETE CASCADE NOT NULL,
  pos_product_id uuid REFERENCES public.pos_products(id) ON DELETE RESTRICT NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL, -- Null means shared
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_pos_invoice_items_invoice ON public.pos_invoice_items(invoice_id);

ALTER TABLE public.pos_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view pos_invoice_items" ON public.pos_invoice_items FOR SELECT USING (invoice_id IN (SELECT id FROM public.pos_invoices WHERE organization_id = public.my_org_id()));
CREATE POLICY "org admins manage pos_invoice_items" ON public.pos_invoice_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.pos_invoices 
    WHERE id = pos_invoice_items.invoice_id 
    AND organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
);

-- 3. Create Payments Table
CREATE TABLE IF NOT EXISTS public.pos_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid REFERENCES public.pos_invoices(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL, -- Null means unassigned payor
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_pos_payments_invoice ON public.pos_payments(invoice_id);

ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can view pos_payments" ON public.pos_payments FOR SELECT USING (invoice_id IN (SELECT id FROM public.pos_invoices WHERE organization_id = public.my_org_id()));
CREATE POLICY "org admins manage pos_payments" ON public.pos_payments FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.pos_invoices 
    WHERE id = pos_payments.invoice_id 
    AND organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
);


-- 4. Dynamic Calculation RPC
CREATE OR REPLACE FUNCTION public.calculate_visit_invoice_payload(p_visit_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_status text := 'open';
  v_invoice_id uuid := null;
  v_clients jsonb;
  v_shared_group_items jsonb;
  v_unassigned_payments jsonb;
  
  v_master_subtotal numeric := 0;
  v_master_paid numeric := 0;
  v_master_balance numeric := 0;
  
  v_result json;
BEGIN
  -- Check if invoice exists for this visit
  SELECT id, status INTO v_invoice_id, v_invoice_status
  FROM public.pos_invoices
  WHERE visit_id = p_visit_id
  LIMIT 1;

  -- 1. BUILD THE CLIENTS OBJECT
  -- We aggregate all clients in this visit. For each, we calculate:
  --   a) Automated trip costs (trip types, activities, courses, rentals)
  --   b) Manual retail costs (pos_invoice_items where client_id matches)
  --   c) Payments (pos_payments where client_id matches)
  
  WITH visit_clients_list AS (
    SELECT c.id as client_id, c.first_name || ' ' || c.last_name as client_name
    FROM public.visit_clients vc
    JOIN public.clients c ON c.id = vc.client_id
    WHERE vc.visit_id = p_visit_id
  ),
  automated_trip_items AS (
    -- Base Trip types
    SELECT 
      tc.client_id, jsonb_build_object('name', pp.name, 'price', pp.price, 'type', 'trip') as item, pp.price as price_num
    FROM public.trip_clients tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.trip_types tt ON tt.id = t.trip_type_id
    JOIN public.pos_products pp ON pp.id = tt.pos_product_id
    WHERE t.visit_id = p_visit_id
    
    UNION ALL
    -- Activities directly on the trip_clients row (if we had act array joined, etc. For now we have activity_id)
    SELECT 
      tc.client_id, jsonb_build_object('name', pp.name, 'price', pp.price, 'type', 'activity') as item, pp.price as price_num
    FROM public.trip_clients tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.activities a ON a.id = tc.activity_id
    JOIN public.pos_products pp ON pp.id = a.pos_product_id
    WHERE t.visit_id = p_visit_id
    
    UNION ALL
    -- Courses directly on the trip_clients row
    SELECT 
      tc.client_id, jsonb_build_object('name', pp.name, 'price', pp.price, 'type', 'course') as item, pp.price as price_num
    FROM public.trip_clients tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.courses c ON c.id = tc.course_id
    JOIN public.pos_products pp ON pp.id = c.pos_product_id
    WHERE t.visit_id = p_visit_id
    
    UNION ALL
    -- Rentals: Pivot evaluation
    -- We join the pos_rental_mappings table matching existing text columns
    SELECT tc.client_id, jsonb_build_object('name', pp.name, 'price', pp.price, 'type', 'rental') as item, pp.price as price_num
    FROM public.trip_clients tc
    JOIN public.trips t ON t.id = tc.trip_id
    JOIN public.pos_rental_mappings frm ON frm.organization_id = t.organization_id
    JOIN public.pos_products pp ON pp.id = frm.pos_product_id
    WHERE t.visit_id = p_visit_id
      AND (
        (frm.rental_field = 'mask' AND (tc.mask IS NOT NULL AND tc.mask != '')) OR
        (frm.rental_field = 'fins' AND (tc.fins IS NOT NULL AND tc.fins != '')) OR
        (frm.rental_field = 'bcd' AND (tc.bcd IS NOT NULL AND tc.bcd != '')) OR
        (frm.rental_field = 'regulator' AND tc.regulator = true) OR
        (frm.rental_field = 'wetsuit' AND (tc.wetsuit IS NOT NULL AND tc.wetsuit != '')) OR
        (frm.rental_field = 'computer' AND tc.computer = true) OR
        (frm.rental_field = 'nitrox' AND tc.nitrox1 = true)
      )
  ),
  client_aggs AS (
    SELECT 
      vcl.client_id,
      vcl.client_name,
      COALESCE((SELECT jsonb_agg(item) FROM automated_trip_items ati WHERE ati.client_id = vcl.client_id), '[]'::jsonb) as automated_items,
      COALESCE((SELECT sum(price_num) FROM automated_trip_items ati WHERE ati.client_id = vcl.client_id), 0) as auto_subtotal,
      
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('name', pp.name, 'price', pii.unit_price, 'qty', pii.quantity))
         FROM public.pos_invoice_items pii
         JOIN public.pos_products pp ON pp.id = pii.pos_product_id
         WHERE pii.invoice_id = v_invoice_id AND pii.client_id = vcl.client_id), '[]'::jsonb
      ) as manual_items,
      COALESCE((SELECT sum(pii.unit_price * pii.quantity) FROM public.pos_invoice_items pii WHERE pii.invoice_id = v_invoice_id AND pii.client_id = vcl.client_id), 0) as manual_subtotal,
      
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('date', ppay.created_at, 'amount', ppay.amount, 'method', ppay.payment_method))
         FROM public.pos_payments ppay
         WHERE ppay.invoice_id = v_invoice_id AND ppay.client_id = vcl.client_id), '[]'::jsonb
      ) as payments,
      COALESCE((SELECT sum(ppay.amount) FROM public.pos_payments ppay WHERE ppay.invoice_id = v_invoice_id AND ppay.client_id = vcl.client_id), 0) as paid_total
      
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

  -- Default to empty object if no clients
  IF v_clients IS NULL THEN v_clients := '{}'::jsonb; END IF;

  -- 2. FETCH SHARED GROUP ITEMS
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('name', pp.name, 'price', pii.unit_price, 'qty', pii.quantity)), '[]'::jsonb
  ) INTO v_shared_group_items
  FROM public.pos_invoice_items pii
  JOIN public.pos_products pp ON pp.id = pii.pos_product_id
  WHERE pii.invoice_id = v_invoice_id AND pii.client_id IS NULL;

  -- 3. FETCH UNASSIGNED PAYMENTS
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('date', ppay.created_at, 'amount', ppay.amount, 'method', ppay.payment_method)), '[]'::jsonb
  ) INTO v_unassigned_payments
  FROM public.pos_payments ppay
  WHERE ppay.invoice_id = v_invoice_id AND ppay.client_id IS NULL;

  -- 4. MASTER TOTALS
  -- We sum up all auto_subtotals, manual_subtotals, and payments from clients, plus the shared/unassigned stuff.
  
  -- Calculate sum of client subtotals
  SELECT COALESCE(SUM((val->'totals'->>'subtotal')::numeric), 0),
         COALESCE(SUM((val->'totals'->>'paid')::numeric), 0)
  INTO v_master_subtotal, v_master_paid
  FROM jsonb_each(v_clients) AS t(key, val);
  
  -- Add shared items to master
  v_master_subtotal := v_master_subtotal + COALESCE((SELECT sum(unit_price * quantity) FROM public.pos_invoice_items WHERE invoice_id = v_invoice_id AND client_id IS NULL), 0);
  
  -- Add unassigned payments to master
  v_master_paid := v_master_paid + COALESCE((SELECT sum(amount) FROM public.pos_payments WHERE invoice_id = v_invoice_id AND client_id IS NULL), 0);
  
  v_master_balance := v_master_subtotal - v_master_paid;

  -- Construct final payload
  v_result := jsonb_build_object(
    'visit_id', p_visit_id,
    'invoice_id', v_invoice_id,
    'status', v_invoice_status,
    'clients', v_clients,
    'shared_group_items', v_shared_group_items,
    'unassigned_payments', v_unassigned_payments,
    'grand_totals', jsonb_build_object(
      'master_subtotal', v_master_subtotal,
      'master_paid', v_master_paid,
      'master_balance', v_master_balance
    )
  );

  RETURN v_result;
END;
$$;
