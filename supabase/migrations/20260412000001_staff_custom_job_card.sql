-- Persists custom-label "Others" job card definitions independently of assignments.
-- A card can exist with zero staff; it disappears only when explicitly deleted.
CREATE TABLE IF NOT EXISTS staff_custom_job_card (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  job_date        DATE NOT NULL,
  am_pm           TEXT NOT NULL CHECK (am_pm IN ('AM', 'PM')),
  custom_label    TEXT NOT NULL,
  job_type_id     UUID NOT NULL,
  UNIQUE (organization_id, job_date, am_pm, custom_label)
);

ALTER TABLE staff_custom_job_card ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage custom job cards"
  ON staff_custom_job_card FOR ALL
  TO authenticated
  USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));
