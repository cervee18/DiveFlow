CREATE TABLE IF NOT EXISTS pos_audit_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_email     text,
  action          text        NOT NULL,
  client_id       uuid        REFERENCES clients(id) ON DELETE SET NULL,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pos_audit_log_org_time ON pos_audit_log (organization_id, created_at DESC);

ALTER TABLE pos_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_audit_org_read" ON pos_audit_log
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "pos_audit_org_insert" ON pos_audit_log
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
