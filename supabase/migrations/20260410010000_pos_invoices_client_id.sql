ALTER TABLE public.pos_invoices
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_invoices_client ON public.pos_invoices(client_id);
