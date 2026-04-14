-- ── Allow admin users to update courses and activities ────────────────────────
-- These tables are global (no organization_id) so policies use the role check
-- from profiles instead of an org-id comparison.

DO $$ BEGIN
  CREATE POLICY "admins can update courses"
    ON public.courses FOR UPDATE
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "admins can update activities"
    ON public.activities FOR UPDATE
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
