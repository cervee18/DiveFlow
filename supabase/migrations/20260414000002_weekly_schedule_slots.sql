-- Weekly schedule blueprint: defines recurring trips per day-of-week.
-- Multiple records can exist for the same (day, vessel, time) with different
-- valid_from dates — the overview picks the most recent one where valid_from <= date.
CREATE TABLE IF NOT EXISTS weekly_schedule_slots (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day_of_week     smallint    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun … 6=Sat (JS convention)
  trip_type_id    uuid        NOT NULL REFERENCES trip_types(id) ON DELETE CASCADE,
  vessel_id       uuid        NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  start_time      time        NOT NULL,
  valid_from      date        NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz DEFAULT now(),

  -- No two identical slot versions on the same effective date
  UNIQUE (organization_id, day_of_week, vessel_id, start_time, valid_from)
);

ALTER TABLE weekly_schedule_slots ENABLE ROW LEVEL SECURITY;

-- All staff can read schedule slots for their org
CREATE POLICY "staff_read_schedule_slots" ON weekly_schedule_slots
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Only admins/owners can insert/update/delete
CREATE POLICY "admin_write_schedule_slots" ON weekly_schedule_slots
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );
