-- Org-owned groupings for dive sites (e.g. North / South)
CREATE TABLE divesite_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  UNIQUE (organization_id, name)
);

ALTER TABLE divesites ADD COLUMN group_id uuid REFERENCES divesite_groups(id) ON DELETE SET NULL;

ALTER TABLE divesite_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read their groups"
  ON divesite_groups FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "admins can manage groups"
  ON divesite_groups FOR ALL
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );
