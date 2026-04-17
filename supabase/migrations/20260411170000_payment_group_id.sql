-- Group batch payments so they display as one record in history
ALTER TABLE public.pos_payments ADD COLUMN IF NOT EXISTS payment_group_id uuid;
