-- Remove agency column from courses and consolidate duplicate names.
-- For each group of rows sharing the same name, keep the earliest-created row
-- and re-point any trip_clients.course_id references to that canonical row.

-- 1. Re-point foreign keys from duplicate rows to the canonical (earliest) row
UPDATE trip_clients tc
SET course_id = canon.id
FROM (
  -- canonical id = the one with the smallest created_at (or smallest id as tiebreak)
  SELECT DISTINCT ON (name)
    id,
    name
  FROM courses
  ORDER BY name, created_at, id
) canon
JOIN courses dup
  ON dup.name = canon.name
  AND dup.id <> canon.id
WHERE tc.course_id = dup.id;

-- 2. Delete the duplicate rows (all non-canonical rows for each name)
DELETE FROM courses
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM courses
  ORDER BY name, created_at, id
);

-- 3. Drop the agency index and column
DROP INDEX IF EXISTS idx_courses_agency;
ALTER TABLE courses DROP COLUMN IF EXISTS agency;

-- 4. Add unique constraint on name to prevent future duplicates
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_name_key;
ALTER TABLE courses ADD CONSTRAINT courses_name_key UNIQUE (name);
