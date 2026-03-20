-- ==============================================================
-- SEED: Visits · Visit Clients · Trip Clients
-- Organization : 13826d8a-653e-459a-a779-967a45c6a9a4
-- Month        : March 2026
-- ==============================================================
-- Visit schedule summary
--   AM+PM visits (14) : V01 V03 V06 V08 V10 V13 V15 V17 V19 V21 V23 V25 V27 V28
--   AM-only visits    : V02 V04 V05 V07 V09 V11 V12 V14 V16 V18 V20 V22 V24 V26
--   + Night (7 of 14) : V01 V06 V10 V17 V21 V23 V27
-- ==============================================================


-- ──────────────────────────────────────────────────────────────
-- BLOCK 1 — 28 Visits
-- hotel_id resolved at runtime via subquery (nullable if not found)
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.visits (id, organization_id, hotel_id, start_date, end_date)
VALUES
  -- V01 · Caribbean Club    · AM+PM+Night · Mar 01-08 · 4 clients
  ('b1000000-0000-0000-0000-000000000001',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Caribbean Club%'      LIMIT 1),
   '2026-03-01', '2026-03-08'),

  -- V02 · Marriott           · AM only     · Mar 02-07 · 3 clients
  ('b1000000-0000-0000-0000-000000000002',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Marriott%'            LIMIT 1),
   '2026-03-02', '2026-03-07'),

  -- V03 · Compass Point      · AM+PM       · Mar 03-10 · 2 clients
  ('b1000000-0000-0000-0000-000000000003',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Compass Point%'       LIMIT 1),
   '2026-03-03', '2026-03-10'),

  -- V04 · Westin             · AM only     · Mar 01-06 · 4 clients
  ('b1000000-0000-0000-0000-000000000004',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Westin%'              LIMIT 1),
   '2026-03-01', '2026-03-06'),

  -- V05 · Sunshine Suites    · AM only     · Mar 05-09 · 1 client  (snorkeler)
  ('b1000000-0000-0000-0000-000000000005',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Sunshine Suites%'     LIMIT 1),
   '2026-03-05', '2026-03-09'),

  -- V06 · Caribbean Club     · AM+PM+Night · Mar 02-09 · 5 clients
  ('b1000000-0000-0000-0000-000000000006',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Caribbean Club%'      LIMIT 1),
   '2026-03-02', '2026-03-09'),

  -- V07 · Marriott           · AM only     · Mar 04-08 · 3 clients
  ('b1000000-0000-0000-0000-000000000007',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Marriott%'            LIMIT 1),
   '2026-03-04', '2026-03-08'),

  -- V08 · Compass Point      · AM+PM       · Mar 06-12 · 4 clients
  ('b1000000-0000-0000-0000-000000000008',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Compass Point%'       LIMIT 1),
   '2026-03-06', '2026-03-12'),

  -- V09 · Westin             · AM only     · Mar 08-13 · 2 clients
  ('b1000000-0000-0000-0000-000000000009',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Westin%'              LIMIT 1),
   '2026-03-08', '2026-03-13'),

  -- V10 · Sunshine Suites    · AM+PM+Night · Mar 07-14 · 6 clients
  ('b1000000-0000-0000-0000-000000000010',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Sunshine Suites%'     LIMIT 1),
   '2026-03-07', '2026-03-14'),

  -- V11 · Caribbean Club     · AM only     · Mar 09-14 · 3 clients
  ('b1000000-0000-0000-0000-000000000011',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Caribbean Club%'      LIMIT 1),
   '2026-03-09', '2026-03-14'),

  -- V12 · Marriott           · AM only     · Mar 10-15 · 2 clients
  ('b1000000-0000-0000-0000-000000000012',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Marriott%'            LIMIT 1),
   '2026-03-10', '2026-03-15'),

  -- V13 · Compass Point      · AM+PM       · Mar 11-17 · 5 clients
  ('b1000000-0000-0000-0000-000000000013',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Compass Point%'       LIMIT 1),
   '2026-03-11', '2026-03-17'),

  -- V14 · Westin             · AM only     · Mar 12-16 · 4 clients
  ('b1000000-0000-0000-0000-000000000014',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Westin%'              LIMIT 1),
   '2026-03-12', '2026-03-16'),

  -- V15 · Sunshine Suites    · AM+PM       · Mar 13-18 · 3 clients
  ('b1000000-0000-0000-0000-000000000015',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Sunshine Suites%'     LIMIT 1),
   '2026-03-13', '2026-03-18'),

  -- V16 · Caribbean Club     · AM only     · Mar 14-19 · 2 clients
  ('b1000000-0000-0000-0000-000000000016',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Caribbean Club%'      LIMIT 1),
   '2026-03-14', '2026-03-19'),

  -- V17 · Marriott           · AM+PM+Night · Mar 15-20 · 5 clients
  ('b1000000-0000-0000-0000-000000000017',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Marriott%'            LIMIT 1),
   '2026-03-15', '2026-03-20'),

  -- V18 · Compass Point      · AM only     · Mar 16-21 · 4 clients
  ('b1000000-0000-0000-0000-000000000018',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Compass Point%'       LIMIT 1),
   '2026-03-16', '2026-03-21'),

  -- V19 · Westin             · AM+PM       · Mar 17-22 · 3 clients
  ('b1000000-0000-0000-0000-000000000019',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Westin%'              LIMIT 1),
   '2026-03-17', '2026-03-22'),

  -- V20 · Sunshine Suites    · AM only     · Mar 18-23 · 2 clients
  ('b1000000-0000-0000-0000-000000000020',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Sunshine Suites%'     LIMIT 1),
   '2026-03-18', '2026-03-23'),

  -- V21 · Caribbean Club     · AM+PM+Night · Mar 19-24 · 6 clients
  ('b1000000-0000-0000-0000-000000000021',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Caribbean Club%'      LIMIT 1),
   '2026-03-19', '2026-03-24'),

  -- V22 · Marriott           · AM only     · Mar 20-25 · 4 clients
  ('b1000000-0000-0000-0000-000000000022',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Marriott%'            LIMIT 1),
   '2026-03-20', '2026-03-25'),

  -- V23 · Compass Point      · AM+PM+Night · Mar 21-26 · 5 clients
  ('b1000000-0000-0000-0000-000000000023',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Compass Point%'       LIMIT 1),
   '2026-03-21', '2026-03-26'),

  -- V24 · Westin             · AM only     · Mar 22-27 · 3 clients
  ('b1000000-0000-0000-0000-000000000024',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Westin%'              LIMIT 1),
   '2026-03-22', '2026-03-27'),

  -- V25 · Sunshine Suites    · AM+PM       · Mar 23-28 · 4 clients
  ('b1000000-0000-0000-0000-000000000025',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Sunshine Suites%'     LIMIT 1),
   '2026-03-23', '2026-03-28'),

  -- V26 · Caribbean Club     · AM only     · Mar 24-29 · 2 clients
  ('b1000000-0000-0000-0000-000000000026',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Caribbean Club%'      LIMIT 1),
   '2026-03-24', '2026-03-29'),

  -- V27 · Marriott           · AM+PM+Night · Mar 25-30 · 5 clients
  ('b1000000-0000-0000-0000-000000000027',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Marriott%'            LIMIT 1),
   '2026-03-25', '2026-03-30'),

  -- V28 · Compass Point      · AM+PM       · Mar 26-30 · 4 clients
  ('b1000000-0000-0000-0000-000000000028',
   '13826d8a-653e-459a-a779-967a45c6a9a4',
   (SELECT id FROM public.hotels WHERE organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4' AND name ILIKE '%Compass Point%'       LIMIT 1),
   '2026-03-26', '2026-03-30');


-- ──────────────────────────────────────────────────────────────
-- BLOCK 2 — 100 visit_clients
-- Clients are numbered 1-100 by email (ORDER BY email).
-- Each client belongs to exactly one visit.
-- ──────────────────────────────────────────────────────────────
WITH numbered_clients AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY email) AS rn
  FROM   public.clients
  WHERE  organization_id = '13826d8a-653e-459a-a779-967a45c6a9a4'
),
visit_assignments (rn_low, rn_high, visit_id) AS (
  VALUES
  (  1,   4, 'b1000000-0000-0000-0000-000000000001'::uuid),  -- V01  4
  (  5,   7, 'b1000000-0000-0000-0000-000000000002'::uuid),  -- V02  3
  (  8,   9, 'b1000000-0000-0000-0000-000000000003'::uuid),  -- V03  2
  ( 10,  13, 'b1000000-0000-0000-0000-000000000004'::uuid),  -- V04  4
  ( 14,  14, 'b1000000-0000-0000-0000-000000000005'::uuid),  -- V05  1
  ( 15,  19, 'b1000000-0000-0000-0000-000000000006'::uuid),  -- V06  5
  ( 20,  22, 'b1000000-0000-0000-0000-000000000007'::uuid),  -- V07  3
  ( 23,  26, 'b1000000-0000-0000-0000-000000000008'::uuid),  -- V08  4
  ( 27,  28, 'b1000000-0000-0000-0000-000000000009'::uuid),  -- V09  2
  ( 29,  34, 'b1000000-0000-0000-0000-000000000010'::uuid),  -- V10  6
  ( 35,  37, 'b1000000-0000-0000-0000-000000000011'::uuid),  -- V11  3
  ( 38,  39, 'b1000000-0000-0000-0000-000000000012'::uuid),  -- V12  2
  ( 40,  44, 'b1000000-0000-0000-0000-000000000013'::uuid),  -- V13  5
  ( 45,  48, 'b1000000-0000-0000-0000-000000000014'::uuid),  -- V14  4
  ( 49,  51, 'b1000000-0000-0000-0000-000000000015'::uuid),  -- V15  3
  ( 52,  53, 'b1000000-0000-0000-0000-000000000016'::uuid),  -- V16  2
  ( 54,  58, 'b1000000-0000-0000-0000-000000000017'::uuid),  -- V17  5
  ( 59,  62, 'b1000000-0000-0000-0000-000000000018'::uuid),  -- V18  4
  ( 63,  65, 'b1000000-0000-0000-0000-000000000019'::uuid),  -- V19  3
  ( 66,  67, 'b1000000-0000-0000-0000-000000000020'::uuid),  -- V20  2
  ( 68,  73, 'b1000000-0000-0000-0000-000000000021'::uuid),  -- V21  6
  ( 74,  77, 'b1000000-0000-0000-0000-000000000022'::uuid),  -- V22  4
  ( 78,  82, 'b1000000-0000-0000-0000-000000000023'::uuid),  -- V23  5
  ( 83,  85, 'b1000000-0000-0000-0000-000000000024'::uuid),  -- V24  3
  ( 86,  89, 'b1000000-0000-0000-0000-000000000025'::uuid),  -- V25  4
  ( 90,  91, 'b1000000-0000-0000-0000-000000000026'::uuid),  -- V26  2
  ( 92,  96, 'b1000000-0000-0000-0000-000000000027'::uuid),  -- V27  5
  ( 97, 100, 'b1000000-0000-0000-0000-000000000028'::uuid)   -- V28  4
)                                                             -- TOTAL 100
INSERT INTO public.visit_clients (visit_id, client_id)
SELECT va.visit_id, nc.id
FROM   numbered_clients nc
JOIN   visit_assignments va ON nc.rn BETWEEN va.rn_low AND va.rn_high
ON CONFLICT (visit_id, client_id) DO NOTHING;


-- ──────────────────────────────────────────────────────────────
-- BLOCK 3 — trip_clients
--
-- Trip-type matching by default_start_time (robust, name-agnostic):
--   08:00 → AM   |  13:00 → PM   |  18:00 → Night
--
-- Activities matched by name ILIKE (graceful NULL if not found):
--   'Dives 1 & 2' → AM trips
--   'Dives 3 & 4' → PM trips
--   Night trips   → NULL activity
--
-- nitrox1 = TRUE when client has a nitrox_cert_number
-- activity_id = NULL when client has no cert_level (snorkeler)
-- Dates: trip must fall on [visit.start_date, visit.end_date)
-- ──────────────────────────────────────────────────────────────
WITH
  org_id AS (
    SELECT '13826d8a-653e-459a-a779-967a45c6a9a4'::uuid AS v
  ),

  -- Visit type flags
  vtype (visit_id, is_am_pm, has_night) AS (
    VALUES
    ('b1000000-0000-0000-0000-000000000001'::uuid, true,  true ),
    ('b1000000-0000-0000-0000-000000000002'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000003'::uuid, true,  false),
    ('b1000000-0000-0000-0000-000000000004'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000005'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000006'::uuid, true,  true ),
    ('b1000000-0000-0000-0000-000000000007'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000008'::uuid, true,  false),
    ('b1000000-0000-0000-0000-000000000009'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000010'::uuid, true,  true ),
    ('b1000000-0000-0000-0000-000000000011'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000012'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000013'::uuid, true,  false),
    ('b1000000-0000-0000-0000-000000000014'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000015'::uuid, true,  false),
    ('b1000000-0000-0000-0000-000000000016'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000017'::uuid, true,  true ),
    ('b1000000-0000-0000-0000-000000000018'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000019'::uuid, true,  false),
    ('b1000000-0000-0000-0000-000000000020'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000021'::uuid, true,  true ),
    ('b1000000-0000-0000-0000-000000000022'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000023'::uuid, true,  true ),
    ('b1000000-0000-0000-0000-000000000024'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000025'::uuid, true,  false),
    ('b1000000-0000-0000-0000-000000000026'::uuid, false, false),
    ('b1000000-0000-0000-0000-000000000027'::uuid, true,  true ),
    ('b1000000-0000-0000-0000-000000000028'::uuid, true,  false)
  ),

  -- Resolve trip-type IDs by their canonical start times
  tt AS (
    SELECT
      (SELECT id FROM public.trip_types
       WHERE  organization_id = (SELECT v FROM org_id)
         AND  default_start_time = '08:00:00' LIMIT 1) AS am_tt,
      (SELECT id FROM public.trip_types
       WHERE  organization_id = (SELECT v FROM org_id)
         AND  default_start_time = '13:00:00' LIMIT 1) AS pm_tt,
      (SELECT id FROM public.trip_types
       WHERE  organization_id = (SELECT v FROM org_id)
         AND  default_start_time = '18:00:00' LIMIT 1) AS night_tt
  ),

  -- Resolve activity IDs by name
  acts AS (
    SELECT
      (SELECT id FROM public.activities WHERE name ILIKE '%1%&%2%' LIMIT 1) AS am_act,
      (SELECT id FROM public.activities WHERE name ILIKE '%3%&%4%' LIMIT 1) AS pm_act
  ),

  -- Enrich visits with type flags and date range
  v_meta AS (
    SELECT v.id AS visit_id, v.start_date, v.end_date,
           vt.is_am_pm, vt.has_night
    FROM   public.visits v
    JOIN   vtype vt ON vt.visit_id = v.id
  ),

  -- One AM trip per (visit, calendar day)
  am_trips AS (
    SELECT DISTINCT ON (vm.visit_id, (t.start_time AT TIME ZONE 'America/Cayman')::date)
           vm.visit_id,
           t.id                                               AS trip_id
    FROM   v_meta vm
    CROSS JOIN tt
    JOIN   public.trips t
           ON  t.organization_id = (SELECT v FROM org_id)
           AND t.trip_type_id    = tt.am_tt
           AND (t.start_time AT TIME ZONE 'America/Cayman')::date >= vm.start_date
           AND (t.start_time AT TIME ZONE 'America/Cayman')::date <  vm.end_date
    ORDER BY vm.visit_id, (t.start_time AT TIME ZONE 'America/Cayman')::date, t.id
  ),

  -- One PM trip per (visit, calendar day) — AM+PM visits only
  pm_trips AS (
    SELECT DISTINCT ON (vm.visit_id, (t.start_time AT TIME ZONE 'America/Cayman')::date)
           vm.visit_id,
           t.id                                               AS trip_id
    FROM   v_meta vm
    CROSS JOIN tt
    JOIN   public.trips t
           ON  t.organization_id = (SELECT v FROM org_id)
           AND t.trip_type_id    = tt.pm_tt
           AND (t.start_time AT TIME ZONE 'America/Cayman')::date >= vm.start_date
           AND (t.start_time AT TIME ZONE 'America/Cayman')::date <  vm.end_date
    WHERE  vm.is_am_pm = true
    ORDER BY vm.visit_id, (t.start_time AT TIME ZONE 'America/Cayman')::date, t.id
  ),

  -- Exactly ONE night trip per night-enabled visit
  night_trips AS (
    SELECT DISTINCT ON (vm.visit_id)
           vm.visit_id,
           t.id AS trip_id
    FROM   v_meta vm
    CROSS JOIN tt
    JOIN   public.trips t
           ON  t.organization_id = (SELECT v FROM org_id)
           AND t.trip_type_id    = tt.night_tt
           AND (t.start_time AT TIME ZONE 'America/Cayman')::date >= vm.start_date
           AND (t.start_time AT TIME ZONE 'America/Cayman')::date <  vm.end_date
    WHERE  vm.has_night = true
    ORDER BY vm.visit_id, t.id
  ),

  -- Expand to (trip, client) pairs — all combinations
  all_pairs AS (

    -- AM ─ every client in visit, every AM trip day
    SELECT at.trip_id,
           vc.client_id,
           (c.nitrox_cert_number IS NOT NULL)                               AS nitrox1,
           CASE WHEN c.cert_level IS NOT NULL
                THEN (SELECT am_act FROM acts)
                ELSE NULL END                                               AS activity_id
    FROM   am_trips at
    JOIN   public.visit_clients vc ON vc.visit_id = at.visit_id
    JOIN   public.clients       c  ON c.id        = vc.client_id

    UNION ALL

    -- PM ─ every client in AM+PM visit, every PM trip day
    SELECT pt.trip_id,
           vc.client_id,
           (c.nitrox_cert_number IS NOT NULL)                               AS nitrox1,
           CASE WHEN c.cert_level IS NOT NULL
                THEN (SELECT pm_act FROM acts)
                ELSE NULL END                                               AS activity_id
    FROM   pm_trips pt
    JOIN   public.visit_clients vc ON vc.visit_id = pt.visit_id
    JOIN   public.clients       c  ON c.id        = vc.client_id

    UNION ALL

    -- Night ─ every client in night visit, single night trip
    SELECT nt.trip_id,
           vc.client_id,
           false    AS nitrox1,
           NULL::uuid AS activity_id
    FROM   night_trips nt
    JOIN   public.visit_clients vc ON vc.visit_id = nt.visit_id
  )

INSERT INTO public.trip_clients (trip_id, client_id, nitrox1, activity_id)
SELECT trip_id, client_id, nitrox1, activity_id
FROM   all_pairs
ON CONFLICT (trip_id, client_id) DO NOTHING;
