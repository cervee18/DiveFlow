-- Simplify Pool and Class trip types: replace all variants with a single
-- "Pool" and a single "Class" entry. Any trips already using the old types
-- are re-pointed to the new ones before the old rows are deleted.

DO $$
DECLARE
  v_org_id  uuid := '13826d8a-653e-459a-a779-967a45c6a9a4';
  v_pool_id uuid;
  v_class_id uuid;
BEGIN

  -- 1. Insert the canonical Pool type (or get it if already exists)
  INSERT INTO public.trip_types (id, organization_id, name, abbreviation, color, type, default_start_time, number_of_dives)
  VALUES (gen_random_uuid(), v_org_id, 'Pool', 'Pool', 'blue', 'Pool', '07:45:00', 1)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_pool_id
  FROM public.trip_types
  WHERE organization_id = v_org_id AND name = 'Pool' AND type = 'Pool'
  LIMIT 1;

  -- 2. Insert the canonical Class type (or get it if already exists)
  INSERT INTO public.trip_types (id, organization_id, name, abbreviation, color, type, default_start_time, number_of_dives)
  VALUES (gen_random_uuid(), v_org_id, 'Class', 'Class', 'purple', 'Class', '08:00:00', 2)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_class_id
  FROM public.trip_types
  WHERE organization_id = v_org_id AND name = 'Class' AND type = 'Class'
  LIMIT 1;

  -- 3. Re-point any trips using old Pool variants → new Pool type
  UPDATE public.trips
  SET trip_type_id = v_pool_id
  WHERE trip_type_id IN (
    SELECT id FROM public.trip_types
    WHERE organization_id = v_org_id
      AND type = 'Pool'
      AND id != v_pool_id
  );

  -- 4. Re-point any trips using old Class variants → new Class type
  UPDATE public.trips
  SET trip_type_id = v_class_id
  WHERE trip_type_id IN (
    SELECT id FROM public.trip_types
    WHERE organization_id = v_org_id
      AND type = 'Class'
      AND id != v_class_id
  );

  -- 5. Delete all old Pool variants (everything except the new canonical one)
  DELETE FROM public.trip_types
  WHERE organization_id = v_org_id
    AND type = 'Pool'
    AND id != v_pool_id;

  -- 6. Delete all old Class variants (everything except the new canonical one)
  DELETE FROM public.trip_types
  WHERE organization_id = v_org_id
    AND type = 'Class'
    AND id != v_class_id;

END $$;
