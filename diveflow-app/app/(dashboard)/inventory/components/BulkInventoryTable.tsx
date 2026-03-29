import { useState } from "react";
import { upsertBulkItem } from "../actions";

export default function BulkInventoryTable({ 
  items, 
  categories 
}: { 
  items: any[], 
  categories: any[] 
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  const handleUpdate = async (formData: FormData) => {
    setIsUpdating(true);
    setErrorText("");

    const res = await upsertBulkItem(formData);
    
    if (res?.error) {
      setErrorText(res.error);
    }
    
    setIsUpdating(false);
  };

  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const handleInlineUpdate = async (formData: FormData) => {
    const res = await upsertBulkItem(formData);
    if (!res?.error) {
      setEditingItemId(null);
    }
  };

  // Group items by category name
  const groupedItems = items.reduce((acc, item) => {
    const catName = item.categoryName;
    if (!acc[catName]) acc[catName] = [];
    acc[catName].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="flex flex-col gap-8">
      
      {/* Add New Bulk Item Form */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">Add or Update Quantity</h3>
        <form action={handleUpdate} className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full relative">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Category
            </label>
            <select
              name="categoryId"
              required
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50 appearance-none cursor-pointer"
            >
              <option value="">Select Category...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 w-full relative">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Size
            </label>
            {selectedCategory && selectedCategory.sizes && selectedCategory.sizes.length > 0 ? (
              <select
                name="size"
                required
                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50 appearance-none cursor-pointer"
              >
                <option value="">Select Size...</option>
                {selectedCategory.sizes.map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                name="size"
                readOnly
                placeholder="N/A (One Size)"
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-400 outline-none cursor-not-allowed"
              />
            )}
          </div>

          <div className="flex-1 w-full relative">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Total Quantity
            </label>
            <input
              type="number"
              name="quantity"
              min="0"
              required
              placeholder="0"
              className="w-full h-10 px-3 bg-white border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50"
            />
          </div>

          <button
            type="submit"
            disabled={isUpdating}
            className="h-10 px-6 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-medium rounded-md transition-colors w-full md:w-auto mt-4 md:mt-0"
          >
            {isUpdating ? "Saving..." : "Save"}
          </button>
        </form>
        {errorText && (
          <p className="text-red-600 text-xs mt-2">{errorText}</p>
        )}
      </div>

      {/* RENDER GROUPED ITEMS */}
      <div className="flex flex-col gap-6">
        {Object.keys(groupedItems).length === 0 ? (
          <p className="text-sm text-slate-500 italic p-4 text-center bg-white border border-slate-200 rounded-md shadow-sm">
            No bulk inventory tracked yet. Use the form above to add some.
          </p>
        ) : (
          (Object.entries(groupedItems) as [string, any[]][]).map(([categoryName, items]) => (
            <div key={categoryName} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                <h4 className="text-base font-medium text-slate-800">{categoryName}</h4>
                <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 font-medium tracking-wide">
                  Total: {items.reduce((sum: number, i: any) => sum + i.quantity, 0)} items
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.sort((a: any, b: any) => (a.size || '').localeCompare(b.size || '')).map((item: any) => (
                  <li key={item.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                    <span className="text-sm font-medium text-slate-700">
                      Size: {item.size || (
                        <span className="text-slate-400 italic font-normal">N/A (One Size)</span>
                      )}
                    </span>
                    
                    {editingItemId === item.id ? (
                      <form action={handleInlineUpdate} className="flex gap-2 items-center">
                        <input type="hidden" name="categoryId" value={item.categoryId} />
                        <input type="hidden" name="size" value={item.size || ""} />
                        <input
                          type="number"
                          name="quantity"
                          defaultValue={item.quantity}
                          min="0"
                          required
                          autoFocus
                          className="w-20 h-8 px-2 bg-white border border-teal-500 rounded text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50 tabular-nums text-center font-bold"
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingItemId(null);
                          }}
                        />
                        <button type="submit" className="p-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded shadow-sm transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button type="button" onClick={() => setEditingItemId(null)} className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded shadow-sm transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => setEditingItemId(item.id)}
                        className="text-sm text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 font-medium tabular-nums bg-slate-100 border border-transparent px-3 py-1 rounded-full transition-colors group flex items-center gap-2"
                        title="Click to edit quantity"
                      >
                        {item.quantity} QTY
                        <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
