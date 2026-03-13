@echo off

set OUTPUT_FILE=diveflow_schema.sql
set DB_URL=postgresql://postgres:02740821diveFlow@db.jsqjbnamfnwiesqkcmdp.supabase.co:5432/postgres

echo Exporting DiveFlow schema...

supabase db dump --db-url %DB_URL% -f %OUTPUT_FILE%

echo Schema exported to %OUTPUT_FILE%
pause