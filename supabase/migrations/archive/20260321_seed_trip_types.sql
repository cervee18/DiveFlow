-- Seed trip_types for DiveFlow organisation 13826d8a-653e-459a-a779-967a45c6a9a4
-- "Pools 1-3" already exists — all other Pool and Class types are inserted here.
-- Color is assigned at the TYPE level:
--   Pool  → blue
--   Class → purple
--   Diving / Snorkel → to be defined when those types are added

INSERT INTO public.trip_types
  (id, organization_id, name, abbreviation, color, type, default_start_time, number_of_dives)
VALUES
  -- ── Pool singles ────────────────────────────────────────────────────────────
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pool 1',    'P1',  'blue',   'Pool',  '07:45:00', 1),
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pool 2',    'P2',  'blue',   'Pool',  '07:45:00', 1),
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pool 3',    'P3',  'blue',   'Pool',  '07:45:00', 1),
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pool 4',    'P4',  'blue',   'Pool',  '07:45:00', 1),
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pool 5',    'P5',  'blue',   'Pool',  '07:45:00', 1),

  -- ── Pool pairs ──────────────────────────────────────────────────────────────
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pools 1-2', '1-2', 'blue',   'Pool',  '07:45:00', 1),
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pools 2-3', '2-3', 'blue',   'Pool',  '07:45:00', 1),
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pools 3-4', '3-4', 'blue',   'Pool',  '07:45:00', 1),
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pools 4-5', '4-5', 'blue',   'Pool',  '07:45:00', 1),

  -- ── Pool triples (Pools 1-3 already exists, skipped) ────────────────────────
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pools 2-4', '2-4', 'blue',   'Pool',  '07:45:00', 1),
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Pools 3-5', '3-5', 'blue',   'Pool',  '07:45:00', 1),

  -- ── Classes ─────────────────────────────────────────────────────────────────
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Nitrox Class',    'NX',   'purple', 'Class', '08:00:00', 2),
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Specialty Class', 'SPEC', 'purple', 'Class', '08:00:00', 2),
  (gen_random_uuid(), '13826d8a-653e-459a-a779-967a45c6a9a4', 'Rescue Class',    'RES',  'purple', 'Class', '08:00:00', 2);
