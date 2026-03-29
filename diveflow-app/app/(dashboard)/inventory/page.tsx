import { getBulkInventory, getEquipmentCategories } from "./actions";
import InventoryClient from "./components/InventoryClient";

export default async function InventoryPage() {
  const bulkItems = await getBulkInventory();
  const categories = await getEquipmentCategories();

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto w-full flex flex-col gap-8 h-auto lg:h-[calc(100vh-4rem)] overflow-y-auto lg:overflow-hidden relative">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Rental Inventory</h1>
        <p className="text-slate-500 text-sm">
          Track bulk equipment counts and search for serialized gear (Regulators, Computers, Tanks).
        </p>
      </div>

      <InventoryClient 
        initialBulkItems={bulkItems} 
        categories={categories} 
      />
    </div>
  );
}
