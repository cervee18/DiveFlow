#!/usr/bin/env bash
# Pulls data from remote Supabase and restores it into the local dev instance.
# Safe to run anytime — does NOT reset the schema, only replaces data.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP_FILE="$ROOT/remote_data.sql"

echo "→ Dumping data from remote..."
supabase db dump --linked --data-only -f "$DUMP_FILE"

echo "→ Copying dump into Supabase container..."
docker cp "$DUMP_FILE" supabase_db_DiveFlow:/remote_data.sql

echo "→ Restoring data (triggers disabled to handle FK order)..."
MSYS_NO_PATHCONV=1 docker exec supabase_db_DiveFlow \
  psql -U postgres -d postgres -v ON_ERROR_STOP=0 \
  -c "SET session_replication_role = replica;" \
  -f /remote_data.sql

echo "✓ Local database restored from remote."
