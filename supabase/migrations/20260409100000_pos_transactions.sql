-- 1. Create pos_transactions table
-- Each checkout session creates one transaction, grouping items and payment together.
CREATE TABLE IF NOT EXISTS public.pos_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid REFERENCES public.pos_invoices(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_transactions_invoice ON public.pos_transactions(invoice_id);

ALTER TABLE public.pos_transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "org members can view pos_transactions" ON public.pos_transactions FOR SELECT
    USING (invoice_id IN (SELECT id FROM public.pos_invoices WHERE organization_id = public.my_org_id()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "org admins manage pos_transactions" ON public.pos_transactions FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.pos_invoices
        WHERE id = pos_transactions.invoice_id
        AND organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add transaction_id to pos_invoice_items
ALTER TABLE public.pos_invoice_items
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.pos_transactions(id) ON DELETE SET NULL;

-- 3. Add transaction_id to pos_payments
ALTER TABLE public.pos_payments
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.pos_transactions(id) ON DELETE SET NULL;
