-- POS open/close sessions. One open session per org at a time (closed_at IS NULL = open).
-- Payments are blocked by the application layer when no open session exists.

CREATE TABLE public.pos_sessions (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opened_at        timestamptz   NOT NULL DEFAULT now(),
  opened_by_email  text,
  opening_cash     numeric(10,2) NOT NULL DEFAULT 0,
  closed_at        timestamptz,
  closed_by_email  text
);

ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "org members can manage their sessions"
    ON public.pos_sessions FOR ALL
    USING  (organization_id = public.my_org_id())
    WITH CHECK (organization_id = public.my_org_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX pos_sessions_org_open_idx ON public.pos_sessions (organization_id, opened_at DESC)
  WHERE closed_at IS NULL;
