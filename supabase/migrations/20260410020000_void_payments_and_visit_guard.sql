-- ── 1. Add void tracking columns to pos_payments ─────────────────────────
ALTER TABLE public.pos_payments
  ADD COLUMN IF NOT EXISTS voided_at  timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text;

CREATE INDEX IF NOT EXISTS idx_pos_payments_voided ON public.pos_payments(voided_at)
  WHERE voided_at IS NULL;   -- partial index — fast lookup of active payments

-- ── 2. Trigger: prevent deleting a visit that has active (non-voided) payments ──
CREATE OR REPLACE FUNCTION public.guard_visit_deletion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.pos_payments pp
    JOIN public.pos_invoices  pi ON pi.id = pp.invoice_id
    WHERE pi.visit_id = OLD.id
      AND pp.voided_at IS NULL          -- at least one active payment → block
  ) THEN
    RAISE EXCEPTION
      'Cannot delete visit "%": it has recorded payments. Void all payments first.',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_visit_deletion ON public.visits;

CREATE TRIGGER guard_visit_deletion
  BEFORE DELETE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.guard_visit_deletion();
