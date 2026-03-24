-- Replace boolean nitrox columns with tank type text columns
-- Values: '63air' | '63eanx' | '100air' | '100eanx' | null

ALTER TABLE trip_clients
  ADD COLUMN IF NOT EXISTS tank1 text,
  ADD COLUMN IF NOT EXISTS tank2 text;
