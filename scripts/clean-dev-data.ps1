# clean-dev-data.ps1
# Deletes all trips, visits, POS transactional data, and client deposits.
# Products, categories, clients, and org settings are preserved.

Write-Host ""
Write-Host "This will permanently delete:" -ForegroundColor Yellow
Write-Host "   - All trips & trip_clients"
Write-Host "   - All visits & visit_clients"
Write-Host "   - All POS invoices, payments, transactions, and parked carts"
Write-Host "   - All client deposits & deposit_applications"
Write-Host ""
$confirm = Read-Host "Type YES to continue"
if ($confirm -ne "YES") {
    Write-Host "Aborted." -ForegroundColor Red
    exit 0
}

$sql = @"
SET session_replication_role = replica;

TRUNCATE TABLE
  deposit_applications,
  client_deposits
CASCADE;

TRUNCATE TABLE
  pos_payments,
  pos_transactions,
  pos_invoice_items,
  pos_invoices,
  pos_parked_cart_items,
  pos_parked_carts
CASCADE;

TRUNCATE TABLE
  visit_clients,
  visits
CASCADE;

TRUNCATE TABLE
  trip_clients,
  trips
CASCADE;

SET session_replication_role = DEFAULT;

SELECT 'Done. Trips, visits, POS data, and client deposits cleared.' AS result;
"@

$sql | docker exec -i supabase_db_DiveFlow psql -U postgres -d postgres

Write-Host ""
Write-Host "Clean complete." -ForegroundColor Green
