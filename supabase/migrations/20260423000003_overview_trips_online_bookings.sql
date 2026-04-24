-- Update get_overview_trips to include online booking pax in booked_divers.
-- Counts confirmed bookings + active holds (not yet expired).
CREATE OR REPLACE FUNCTION "public"."get_overview_trips"(
  "p_org_id" "uuid",
  "p_start"  timestamp with time zone,
  "p_end"    timestamp with time zone
)
RETURNS TABLE(
  "id"                       "uuid",
  "label"                    "text",
  "start_time"               timestamp with time zone,
  "max_divers"               integer,
  "entry_mode"               "text",
  "vessel_id"                "uuid",
  "vessel_name"              "text",
  "vessel_abbreviation"      "text",
  "trip_type_name"           "text",
  "trip_type_abbreviation"   "text",
  "trip_type_color"          "text",
  "trip_type_category"       "text",
  "trip_type_number_of_dives" integer,
  "booked_divers"            bigint,
  "activity_counts"          "jsonb"
)
LANGUAGE "sql" STABLE SECURITY DEFINER
AS $$
  SELECT
    t.id,
    t.label,
    t.start_time,
    t.max_divers,
    t.entry_mode,
    t.vessel_id,
    v.name                AS vessel_name,
    v.abbreviation        AS vessel_abbreviation,
    tt.name               AS trip_type_name,
    tt.abbreviation       AS trip_type_abbreviation,
    tt.color              AS trip_type_color,
    tt.category           AS trip_type_category,
    tt.number_of_dives    AS trip_type_number_of_dives,

    -- Manual clients + confirmed/active online bookings
    (
      SELECT COUNT(*)
      FROM public.trip_clients tc
      WHERE tc.trip_id = t.id
    ) + COALESCE((
      SELECT SUM(ob.pax_count)
      FROM public.online_bookings ob
      WHERE ob.trip_id = t.id
        AND ob.status IN ('held', 'confirmed')
        AND (ob.status = 'confirmed' OR ob.hold_expires_at > now())
    ), 0) AS booked_divers,

    -- Activity breakdown (unchanged)
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'name',         a.name,
            'abbreviation', COALESCE(a.abbreviation, a.name),
            'count',        ac.cnt
          )
          ORDER BY a.name
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT activity_id, COUNT(*) AS cnt
        FROM public.trip_clients
        WHERE trip_id = t.id
          AND activity_id IS NOT NULL
        GROUP BY activity_id
      ) ac
      JOIN public.activities a ON a.id = ac.activity_id
    ) AS activity_counts

  FROM public.trips t
  LEFT JOIN public.vessels    v  ON v.id  = t.vessel_id
  LEFT JOIN public.trip_types tt ON tt.id = t.trip_type_id
  WHERE t.organization_id = p_org_id
    AND t.start_time      >= p_start
    AND t.start_time       < p_end
  ORDER BY t.start_time ASC;
$$;
