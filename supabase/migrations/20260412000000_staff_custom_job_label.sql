-- Add custom_label column to staff_daily_job for flexible "Others" job cards
ALTER TABLE staff_daily_job ADD COLUMN IF NOT EXISTS custom_label TEXT;

-- Seed global 'Others' job type if it doesn't already exist
INSERT INTO job_types (name, sort_order)
SELECT 'Others', 998
WHERE NOT EXISTS (
  SELECT 1 FROM job_types WHERE name = 'Others'
);
