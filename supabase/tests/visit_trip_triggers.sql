-- ============================================================================
-- Visit / Trip / Payment Trigger Tests
-- ----------------------------------------------------------------------------
-- Exercises all 4 triggers introduced in migrations 20260410020000..060000:
--
--   T1. guard_visit_deletion
--       - blocks DELETE on visits with active (non-voided) payments
--       - allows DELETE when all payments are voided
--   T2. cascade_trips_on_visit_delete
--       - removes trip_clients for members with requires_visit = true
--       - leaves trip_clients untouched for local residents (requires_visit = false)
--   T3. cascade_trip_removal_on_visit_client_delete
--       - removes trip_clients when a single client is unlinked from a visit
--   T4. guard_trip_client_visit
--       - blocks INSERT on trip_clients when the client requires a visit and
--         no visit covers the trip date
--       - allows INSERT when the client is a local resident (requires_visit = false)
--
-- How to run:
--   supabase db execute --file supabase/tests/visit_trip_triggers.sql
--   (or: psql "$DATABASE_URL" -f supabase/tests/visit_trip_triggers.sql)
--
-- Everything runs inside a single transaction that ROLLBACKs at the end, so
-- nothing is written to the database. Any failed assertion RAISEs and aborts
-- the script with a clear message.
-- ============================================================================

BEGIN;

-- Run as table owner so RLS does not interfere with the test harness itself.
-- (The triggers themselves are SECURITY DEFINER, which is what we're testing.)
SET LOCAL ROLE postgres;

DO $test$
DECLARE
  v_org_id       uuid := gen_random_uuid();
  v_client_a     uuid := gen_random_uuid();  -- requires_visit = true
  v_client_local uuid := gen_random_uuid();  -- requires_visit = false (local resident)
  v_visit_id     uuid := gen_random_uuid();
  v_trip_id      uuid := gen_random_uuid();
  v_trip_type_id uuid;
  v_invoice_id   uuid := gen_random_uuid();
  v_payment_id   uuid := gen_random_uuid();
  v_vc_a_id      uuid;
  v_tc_a_id      uuid;
  v_caught       boolean;
  v_count        int;
BEGIN
  -- ── SETUP ────────────────────────────────────────────────────────────────
  RAISE NOTICE '── SETUP ──';

  INSERT INTO public.organizations (id, name, require_visit_for_trips)
  VALUES (v_org_id, 'TEST ORG trigger-suite', true);

  INSERT INTO public.clients (id, organization_id, first_name, last_name, requires_visit)
  VALUES
    (v_client_a,     v_org_id, 'Alice',   'RequiresVisit', true),
    (v_client_local, v_org_id, 'Bob',     'LocalResident', false);

  INSERT INTO public.visits (id, organization_id, start_date, end_date)
  VALUES (v_visit_id, v_org_id, CURRENT_DATE, CURRENT_DATE + 6);

  INSERT INTO public.visit_clients (visit_id, client_id)
  VALUES (v_visit_id, v_client_a)
  RETURNING id INTO v_vc_a_id;

  -- Minimal trip_type (required by trips.trip_type_id? It's nullable per schema)
  SELECT id INTO v_trip_type_id
  FROM public.trip_types
  WHERE organization_id = v_org_id
  LIMIT 1;

  INSERT INTO public.trips (id, organization_id, start_time, duration_minutes, max_divers)
  VALUES (v_trip_id, v_org_id,
          (CURRENT_DATE + 2)::timestamptz + interval '9 hours',
          120, 10);

  RAISE NOTICE 'setup complete: org=%, visit=%, trip=%', v_org_id, v_visit_id, v_trip_id;

  -- ── T4a. guard_trip_client_visit ALLOWS visit-covered client ────────────
  RAISE NOTICE '── T4a: insert trip_client for Alice (has visit) ──';
  INSERT INTO public.trip_clients (trip_id, client_id)
  VALUES (v_trip_id, v_client_a)
  RETURNING id INTO v_tc_a_id;
  RAISE NOTICE '  ✓ allowed';

  -- ── T4b. guard_trip_client_visit ALLOWS local resident ──────────────────
  RAISE NOTICE '── T4b: insert trip_client for Bob (local resident, no visit) ──';
  INSERT INTO public.trip_clients (trip_id, client_id)
  VALUES (v_trip_id, v_client_local);
  RAISE NOTICE '  ✓ allowed';

  -- ── T4c. guard_trip_client_visit BLOCKS when no visit covers date ───────
  RAISE NOTICE '── T4c: insert trip_client for Alice on a date outside her visit ──';
  DECLARE
    v_future_trip uuid := gen_random_uuid();
  BEGIN
    INSERT INTO public.trips (id, organization_id, start_time, duration_minutes, max_divers)
    VALUES (v_future_trip, v_org_id,
            (CURRENT_DATE + 30)::timestamptz + interval '9 hours',
            120, 10);

    v_caught := false;
    BEGIN
      INSERT INTO public.trip_clients (trip_id, client_id)
      VALUES (v_future_trip, v_client_a);
    EXCEPTION WHEN restrict_violation THEN
      v_caught := true;
    END;
    IF NOT v_caught THEN
      RAISE EXCEPTION 'T4c FAILED: expected restrict_violation, insert was allowed';
    END IF;
    RAISE NOTICE '  ✓ blocked as expected';
  END;

  -- ── T1a. guard_visit_deletion BLOCKS with active payment ────────────────
  RAISE NOTICE '── T1a: delete visit with an active payment ──';
  INSERT INTO public.pos_invoices (id, organization_id, visit_id, status)
  VALUES (v_invoice_id, v_org_id, v_visit_id, 'partially_paid');

  INSERT INTO public.pos_payments (id, invoice_id, client_id, amount, payment_method)
  VALUES (v_payment_id, v_invoice_id, v_client_a, 50, 'cash');

  v_caught := false;
  BEGIN
    DELETE FROM public.visits WHERE id = v_visit_id;
  EXCEPTION WHEN restrict_violation THEN
    v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'T1a FAILED: visit was deleted despite having an active payment';
  END IF;
  RAISE NOTICE '  ✓ blocked as expected';

  -- ── T1b. guard_visit_deletion ALLOWS when payment voided ────────────────
  RAISE NOTICE '── T1b: void the payment, ensure guard still blocks? No → should ALLOW delete ──';
  UPDATE public.pos_payments
     SET voided_at = now(), void_reason = 'test'
   WHERE id = v_payment_id;

  -- Put trip_clients back so we can re-test cascade after voiding
  -- (Alice row was created in T4a; confirm it still exists)
  SELECT count(*) INTO v_count FROM public.trip_clients WHERE id = v_tc_a_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Sanity check failed: Alice trip_client row missing (count=%)', v_count;
  END IF;

  -- ── T2a. cascade_trips_on_visit_delete removes Alice, keeps Bob ─────────
  RAISE NOTICE '── T2: delete visit, expect Alice removed from trip, Bob kept ──';
  DELETE FROM public.visits WHERE id = v_visit_id;

  SELECT count(*) INTO v_count
  FROM public.trip_clients
  WHERE trip_id = v_trip_id AND client_id = v_client_a;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'T2 FAILED: Alice (requires_visit) still on trip after visit delete (count=%)', v_count;
  END IF;
  RAISE NOTICE '  ✓ Alice removed from trip';

  SELECT count(*) INTO v_count
  FROM public.trip_clients
  WHERE trip_id = v_trip_id AND client_id = v_client_local;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'T2 FAILED: Bob (local resident) should still be on trip (count=%)', v_count;
  END IF;
  RAISE NOTICE '  ✓ Bob (local resident) preserved';

  -- ── T3. cascade_trip_removal_on_visit_client_delete ─────────────────────
  RAISE NOTICE '── T3: single-client unlink cascades to trip_clients ──';
  -- Rebuild state: new visit + membership + trip booking for Alice
  DECLARE
    v_visit2 uuid := gen_random_uuid();
    v_trip2  uuid := gen_random_uuid();
    v_vc2_id uuid;
  BEGIN
    INSERT INTO public.visits (id, organization_id, start_date, end_date)
    VALUES (v_visit2, v_org_id, CURRENT_DATE, CURRENT_DATE + 6);

    INSERT INTO public.visit_clients (visit_id, client_id)
    VALUES (v_visit2, v_client_a)
    RETURNING id INTO v_vc2_id;

    INSERT INTO public.trips (id, organization_id, start_time, duration_minutes, max_divers)
    VALUES (v_trip2, v_org_id,
            (CURRENT_DATE + 2)::timestamptz + interval '9 hours',
            120, 10);

    INSERT INTO public.trip_clients (trip_id, client_id)
    VALUES (v_trip2, v_client_a);

    -- Unlink Alice from the visit (but visit itself remains)
    DELETE FROM public.visit_clients WHERE id = v_vc2_id;

    SELECT count(*) INTO v_count
    FROM public.trip_clients
    WHERE trip_id = v_trip2 AND client_id = v_client_a;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'T3 FAILED: Alice still on trip2 after unlinking from visit (count=%)', v_count;
    END IF;
    RAISE NOTICE '  ✓ cascade_trip_removal_on_visit_client_delete worked';
  END;

  RAISE NOTICE '';
  RAISE NOTICE '════════════════════════════════════════';
  RAISE NOTICE '  ALL TRIGGER TESTS PASSED';
  RAISE NOTICE '════════════════════════════════════════';
END
$test$;

ROLLBACK;
