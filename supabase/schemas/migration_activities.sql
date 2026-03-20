-- Create activities table
CREATE TABLE activities (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

-- Add activity_id and private to trip_clients
ALTER TABLE trip_clients
  ADD COLUMN activity_id uuid REFERENCES activities(id),
  ADD COLUMN private     boolean NOT NULL DEFAULT false;
