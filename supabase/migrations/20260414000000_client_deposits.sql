-- Client deposits: money received from a client before or independent of charges.
-- Acts as a credit balance on the client's account.

CREATE TABLE client_deposits (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id         uuid          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount            numeric(10,2) NOT NULL CHECK (amount > 0),
  method            text          NOT NULL,
  note              text,
  recorded_by_email text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  voided            boolean       NOT NULL DEFAULT false,
  void_reason       text,
  voided_at         timestamptz
);

-- Tracks when deposit credit is consumed against a pos_payment row.
-- One deposit can be partially applied across multiple payments (FIFO).
CREATE TABLE deposit_applications (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id     uuid          NOT NULL REFERENCES client_deposits(id),
  payment_id     uuid          NOT NULL REFERENCES pos_payments(id),
  amount_applied numeric(10,2) NOT NULL CHECK (amount_applied > 0),
  created_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_deposits_org_client ON client_deposits(organization_id, client_id);
CREATE INDEX IF NOT EXISTS idx_deposit_applications_deposit ON deposit_applications(deposit_id);
CREATE INDEX IF NOT EXISTS idx_deposit_applications_payment ON deposit_applications(payment_id);
