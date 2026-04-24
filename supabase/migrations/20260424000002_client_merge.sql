-- Enable trigram extension for fuzzy string similarity
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index for fast name similarity searches across 100k+ clients
CREATE INDEX IF NOT EXISTS idx_clients_trgm_name
  ON public.clients USING gin ((lower(first_name || ' ' || last_name)) gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- find_similar_clients(p_client_id)
-- Returns up to 5 clients in the same org that look like duplicates of the
-- given client, scored by a weighted combination of name / email / phone /
-- cert_number similarity.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_similar_clients(p_client_id uuid)
RETURNS TABLE (
  id                uuid,
  client_number     bigint,
  first_name        text,
  last_name         text,
  email             text,
  phone             text,
  cert_number       text,
  cert_level        uuid,
  user_id           uuid,
  similarity_score  numeric,
  match_reasons     text[]
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  v_client public.clients%ROWTYPE;
  v_name   text;
BEGIN
  SELECT * INTO v_client FROM public.clients WHERE clients.id = p_client_id;
  IF v_client.id IS NULL THEN RETURN; END IF;

  v_name := lower(v_client.first_name || ' ' || v_client.last_name);

  RETURN QUERY
  SELECT
    c.id,
    c.client_number,
    c.first_name,
    c.last_name,
    c.email,
    c.phone,
    c.cert_number,
    c.cert_level,
    c.user_id,
    -- Weighted score: name is the primary signal; exact email/phone/cert matches
    -- are treated as near-certain and scored very high regardless of name.
    ROUND(CAST(
      GREATEST(
        similarity(lower(c.first_name || ' ' || c.last_name), v_name),
        CASE WHEN v_client.email IS NOT NULL AND c.email IS NOT NULL
          THEN similarity(lower(c.email), lower(v_client.email)) * 0.95 ELSE 0 END,
        CASE WHEN v_client.phone IS NOT NULL AND c.phone IS NOT NULL
          THEN similarity(c.phone, v_client.phone) * 0.85 ELSE 0 END,
        CASE WHEN v_client.cert_number IS NOT NULL AND c.cert_number IS NOT NULL
          THEN similarity(lower(c.cert_number), lower(v_client.cert_number)) * 0.90 ELSE 0 END
      )
    AS numeric), 3) AS similarity_score,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN similarity(lower(c.first_name || ' ' || c.last_name), v_name) > 0.35
        THEN 'name' ELSE NULL END,
      CASE WHEN v_client.email IS NOT NULL AND c.email IS NOT NULL
        AND similarity(lower(c.email), lower(v_client.email)) > 0.7
        THEN 'email' ELSE NULL END,
      CASE WHEN v_client.phone IS NOT NULL AND c.phone IS NOT NULL
        AND similarity(c.phone, v_client.phone) > 0.7
        THEN 'phone' ELSE NULL END,
      CASE WHEN v_client.cert_number IS NOT NULL AND c.cert_number IS NOT NULL
        AND similarity(lower(c.cert_number), lower(v_client.cert_number)) > 0.8
        THEN 'cert_number' ELSE NULL END
    ], NULL) AS match_reasons
  FROM public.clients c
  WHERE
    c.organization_id = v_client.organization_id
    AND c.id != p_client_id
    AND (
      similarity(lower(c.first_name || ' ' || c.last_name), v_name) > 0.35
      OR (v_client.email IS NOT NULL AND c.email IS NOT NULL
          AND similarity(lower(c.email), lower(v_client.email)) > 0.7)
      OR (v_client.phone IS NOT NULL AND c.phone IS NOT NULL
          AND similarity(c.phone, v_client.phone) > 0.7)
      OR (v_client.cert_number IS NOT NULL AND c.cert_number IS NOT NULL
          AND similarity(lower(c.cert_number), lower(v_client.cert_number)) > 0.8)
    )
  ORDER BY similarity_score DESC
  LIMIT 5;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- merge_clients(p_primary_id, p_duplicate_id)
-- Merges the duplicate into the primary client atomically:
--   1. Blocks if both have an unapplied deposit balance (requires manual review).
--   2. Removes duplicate's FK rows that collide with primary in the same visit/trip.
--   3. Reassigns all other FK rows to the primary.
--   4. Merges nullable fields onto primary (non-null preferred; primary wins when
--      both have a value, except last_dive_date which takes the later date and
--      notes which are concatenated).
--   5. Deletes the duplicate row.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.merge_clients(p_primary_id uuid, p_duplicate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_primary              public.clients%ROWTYPE;
  v_duplicate            public.clients%ROWTYPE;
  v_primary_unapplied    numeric := 0;
  v_duplicate_unapplied  numeric := 0;
BEGIN
  IF p_primary_id = p_duplicate_id THEN
    RETURN jsonb_build_object('error', 'Cannot merge a client with itself');
  END IF;

  SELECT * INTO v_primary   FROM public.clients WHERE id = p_primary_id   FOR UPDATE;
  SELECT * INTO v_duplicate FROM public.clients WHERE id = p_duplicate_id FOR UPDATE;

  IF v_primary.id   IS NULL THEN RETURN jsonb_build_object('error', 'Primary client not found');   END IF;
  IF v_duplicate.id IS NULL THEN RETURN jsonb_build_object('error', 'Duplicate client not found'); END IF;
  IF v_primary.organization_id != v_duplicate.organization_id THEN
    RETURN jsonb_build_object('error', 'Clients belong to different organizations');
  END IF;

  -- ── Deposit conflict check ──────────────────────────────────────────────────
  SELECT COALESCE(SUM(cd.amount) FILTER (WHERE NOT cd.voided), 0)
       - COALESCE(SUM(da.amount_applied), 0)
  INTO v_primary_unapplied
  FROM public.client_deposits cd
  LEFT JOIN public.deposit_applications da ON da.deposit_id = cd.id
  WHERE cd.client_id = p_primary_id;

  SELECT COALESCE(SUM(cd.amount) FILTER (WHERE NOT cd.voided), 0)
       - COALESCE(SUM(da.amount_applied), 0)
  INTO v_duplicate_unapplied
  FROM public.client_deposits cd
  LEFT JOIN public.deposit_applications da ON da.deposit_id = cd.id
  WHERE cd.client_id = p_duplicate_id;

  IF COALESCE(v_primary_unapplied, 0) > 0 AND COALESCE(v_duplicate_unapplied, 0) > 0 THEN
    RETURN jsonb_build_object(
      'error',              'Both clients have an unapplied deposit balance. Please settle one account before merging.',
      'primary_balance',    v_primary_unapplied,
      'duplicate_balance',  v_duplicate_unapplied
    );
  END IF;

  -- ── Remove collisions in shared visits / trips ──────────────────────────────
  -- If both clients are already in the same visit, drop the duplicate's row.
  DELETE FROM public.visit_clients vc_dup
  USING public.visit_clients vc_pri
  WHERE vc_dup.client_id  = p_duplicate_id
    AND vc_pri.client_id  = p_primary_id
    AND vc_pri.visit_id   = vc_dup.visit_id;

  -- Same for trips.
  DELETE FROM public.trip_clients tc_dup
  USING public.trip_clients tc_pri
  WHERE tc_dup.client_id  = p_duplicate_id
    AND tc_pri.client_id  = p_primary_id
    AND tc_pri.trip_id    = tc_dup.trip_id;

  -- ── Reassign all FK references ──────────────────────────────────────────────
  UPDATE public.visit_clients                SET client_id = p_primary_id WHERE client_id = p_duplicate_id;
  UPDATE public.trip_clients                 SET client_id = p_primary_id WHERE client_id = p_duplicate_id;
  UPDATE public.alert_resolutions            SET client_id = p_primary_id WHERE client_id = p_duplicate_id;
  UPDATE public.pos_invoice_items            SET client_id = p_primary_id WHERE client_id = p_duplicate_id;
  UPDATE public.pos_payments                 SET client_id = p_primary_id WHERE client_id = p_duplicate_id;
  UPDATE public.pos_parked_carts             SET client_id = p_primary_id WHERE client_id = p_duplicate_id;
  UPDATE public.pos_auto_item_waivers        SET client_id = p_primary_id WHERE client_id = p_duplicate_id;
  UPDATE public.pos_auto_item_price_overrides SET client_id = p_primary_id WHERE client_id = p_duplicate_id;
  UPDATE public.pos_audit_log                SET client_id = p_primary_id WHERE client_id = p_duplicate_id;
  UPDATE public.pos_invoices                 SET client_id = p_primary_id WHERE client_id = p_duplicate_id;
  UPDATE public.client_deposits              SET client_id = p_primary_id WHERE client_id = p_duplicate_id;

  -- ── Merge nullable fields onto primary ─────────────────────────────────────
  UPDATE public.clients SET
    email                   = COALESCE(email,                   v_duplicate.email),
    phone                   = COALESCE(phone,                   v_duplicate.phone),
    cert_number             = COALESCE(cert_number,             v_duplicate.cert_number),
    cert_level              = COALESCE(cert_level,              v_duplicate.cert_level),
    cert_organization       = COALESCE(cert_organization,       v_duplicate.cert_organization),
    nitrox_cert_number      = COALESCE(nitrox_cert_number,      v_duplicate.nitrox_cert_number),
    last_dive_date          = CASE
                                WHEN last_dive_date IS NULL     THEN v_duplicate.last_dive_date
                                WHEN v_duplicate.last_dive_date IS NULL THEN last_dive_date
                                ELSE GREATEST(last_dive_date, v_duplicate.last_dive_date)
                              END,
    address_street          = COALESCE(address_street,          v_duplicate.address_street),
    address_city            = COALESCE(address_city,            v_duplicate.address_city),
    address_zip             = COALESCE(address_zip,             v_duplicate.address_zip),
    address_country         = COALESCE(address_country,         v_duplicate.address_country),
    emergency_contact_name  = COALESCE(emergency_contact_name,  v_duplicate.emergency_contact_name),
    emergency_contact_phone = COALESCE(emergency_contact_phone, v_duplicate.emergency_contact_phone),
    user_id                 = COALESCE(user_id,                 v_duplicate.user_id),
    notes                   = CASE
                                WHEN notes IS NULL              THEN v_duplicate.notes
                                WHEN v_duplicate.notes IS NULL  THEN notes
                                ELSE notes || E'\n---\n' || v_duplicate.notes
                              END,
    updated_at              = now()
  WHERE id = p_primary_id;

  -- ── Delete duplicate ────────────────────────────────────────────────────────
  DELETE FROM public.clients WHERE id = p_duplicate_id;

  RETURN jsonb_build_object('success', true, 'merged_into', p_primary_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_similar_clients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_clients(uuid, uuid) TO authenticated;
