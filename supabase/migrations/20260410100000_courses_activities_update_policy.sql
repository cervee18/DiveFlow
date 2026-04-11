-- ── Allow admin users to update courses and activities ────────────────────────
-- These tables are global (no organization_id) so policies use the role check
-- from profiles instead of an org-id comparison.

CREATE POLICY "admins can update courses"
  ON public.courses FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admins can update activities"
  ON public.activities FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
