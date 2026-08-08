CREATE OR REPLACE FUNCTION suggest_divesites(p_trip_id uuid)
RETURNS TABLE (
  id                uuid,
  name              text,
  max_depth         numeric,
  group_id          uuid,
  group_name        text,
  unseen_count      bigint,
  total_past_visits bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH org AS (
    SELECT organization_id FROM trips WHERE id = p_trip_id
  ),
  booked AS (
    SELECT client_id FROM trip_clients WHERE trip_id = p_trip_id
  ),
  -- one row per (client, site, past trip) — counts each visit separately
  past_visits AS (
    SELECT tc.client_id, t.dive_site_id
    FROM trip_clients tc
    JOIN trips t ON t.id = tc.trip_id
    WHERE t.organization_id = (SELECT organization_id FROM org)
      AND t.id        != p_trip_id
      AND t.start_time < now()
      AND t.dive_site_id IS NOT NULL
      AND tc.client_id IN (SELECT client_id FROM booked)
  ),
  -- one row per (client, site) — has this client ever been here?
  client_site_seen AS (
    SELECT DISTINCT client_id, dive_site_id FROM past_visits
  ),
  has_groups AS (
    SELECT EXISTS (
      SELECT 1 FROM divesite_groups
      WHERE organization_id = (SELECT organization_id FROM org)
    ) AS value
  )
  SELECT
    ds.id,
    ds.name,
    ds.max_depth,
    ds.group_id,
    dg.name AS group_name,
    -- clients on this trip who have never visited this site
    (SELECT COUNT(*) FROM booked b
     WHERE NOT EXISTS (
       SELECT 1 FROM client_site_seen css
       WHERE css.client_id = b.client_id AND css.dive_site_id = ds.id
     )) AS unseen_count,
    -- total past visits by booked clients to this site
    (SELECT COUNT(*) FROM past_visits pv WHERE pv.dive_site_id = ds.id) AS total_past_visits
  FROM divesites ds
  LEFT JOIN divesite_groups dg ON dg.id = ds.group_id
  WHERE ds.organization_id = (SELECT organization_id FROM org)
    -- if org has groups: only grouped sites; otherwise all sites
    AND (NOT (SELECT value FROM has_groups) OR ds.group_id IS NOT NULL)
  ORDER BY unseen_count DESC, total_past_visits ASC
$$;
