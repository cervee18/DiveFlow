ALTER TABLE public.pos_payments
  ADD COLUMN IF NOT EXISTS recorded_by_email text;
