#!/usr/bin/env bash
# clean-dev-data.sh
# Deletes all trips, visits, and POS transactional data.
# Products, categories, clients, and org settings are preserved.

set -e

echo ""
echo "⚠️  This will permanently delete:"
echo "   • All trips & trip_clients"
echo "   • All visits & visit_clients"
echo "   • All POS invoices, payments, transactions, and parked carts"
echo ""
read -r -p "Type YES to continue: " confirm
if [ "$confirm" != "YES" ]; then
  echo "Aborted."
  exit 0
fi

docker exec -i supabase_db_DiveFlow psql -U postgres -d postgres <<'SQL'
-- Disable triggers temporarily to avoid FK cascade issues with ordering
SET session_replication_role = replica;

-- POS transactional data
TRUNCATE TABLE
  pos_payments,
  pos_transactions,
  pos_invoice_items,
  pos_invoices,
  pos_parked_cart_items,
  pos_parked_carts
CASCADE;

-- Visits
TRUNCATE TABLE
  visit_clients,
  visits
CASCADE;

-- Trips
TRUNCATE TABLE
  trip_clients,
  trips
CASCADE;

SET session_replication_role = DEFAULT;

SELECT 'Done. Trips, visits, and POS data cleared.' AS result;
SQL

echo ""
echo "✅  Clean complete."
