import { useState, useEffect } from "react";
import { searchSerializedInventory, addSerializedItem, updateSerializedItem } from "../actions";

export default function SerializedSearch({ categories }: { categories: any[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Add/Edit State
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      const data = await searchSerializedInventory(query);
      setResults(data || []);
      setIsSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const handleFormSubmit = async (formData: FormData) => {
    setIsSaving(true);
    setErrorText("");
    
    let res;
    if (editingItem) {
      res = await updateSerializedItem(formData);
    } else {
      res = await addSerializedItem(formData);
    }

    if (res?.error) {
      setErrorText(res.error);
    } else {
      setIsAdding(false);
      setEditingItem(null);
      // Trigger a re-search to show the updated data
      const searchVal = formData.get("serialNumber") as string;
      if (query === searchVal) {
        // Force refresh if query is identical
        const data = await searchSerializedInventory(searchVal);
        setResults(data || []);
      } else {
        setQuery(searchVal);
      }
    }
    
    setIsSaving(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingItem(null);
    setErrorText("");
  };

  return (
    <div className="flex flex-col gap-8">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <div className="flex-1 w-full max-w-md relative">
          <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by serial #, name, or model..."
            className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50"
          />
        </div>
        <button
          onClick={() => { setIsAdding(true); setEditingItem(null); }}
          className="h-10 px-6 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-md transition-colors w-full md:w-auto flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">+</span> Log New Item
        </button>
      </div>

      {/* Add / Edit Wrapper */}
      {(isAdding || editingItem) && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-4 duration-200">
          <h3 className="text-base font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">
            {editingItem ? "Edit Serialized Equipment" : "Log Serialized Equipment"}
          </h3>
          <form action={handleFormSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {editingItem && <input type="hidden" name="itemId" value={editingItem.id} />}
            
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</label>
              <select name="categoryId" required defaultValue={editingItem?.category_id || ""} className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50 appearance-none cursor-pointer">
                <option value="">Select...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Serial Number</label>
              <input type="text" name="serialNumber" required defaultValue={editingItem?.serial_number || ""} placeholder="e.g. SN-99812A" className="h-10 px-3 bg-white border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Item Name / Title</label>
              <input type="text" name="name" required defaultValue={editingItem?.name || ""} placeholder="e.g. Scubapro MK25" className="h-10 px-3 bg-white border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand (Optional)</label>
              <input type="text" name="brand" defaultValue={editingItem?.brand || ""} placeholder="e.g. Scubapro" className="h-10 px-3 bg-white border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50" />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Condition</label>
              <select name="condition" defaultValue={editingItem?.condition || "Good"} required className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/50 appearance-none cursor-pointer">
                <option value="Good">Good</option>
                <option value="Needs Service">Needs Service</option>
                <option value="Retired">Retired</option>
              </select>
            </div>

            <div className="md:col-span-2 flex items-center justify-end gap-3 mt-2 pt-4 border-t border-slate-100">
              {errorText && <span className="text-red-500 text-xs mr-auto">{errorText}</span>}
              <button type="button" onClick={handleCancel} className="px-5 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="px-6 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white text-sm font-medium rounded-md transition-colors shadow-sm">
                {isSaving ? "Saving..." : (editingItem ? "Update Item" : "Save Item")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Results */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden min-h-[300px]">
        {query.trim().length < 2 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center h-full text-slate-400">
            <svg className="w-12 h-12 mb-3 stroke-current opacity-50" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
            <p className="text-base font-medium text-slate-600">Start typing to search serialized gear</p>
            <p className="text-xs mt-1 max-w-sm">Use the search bar above to instantly find specific Regulators, Computers, or Tanks by their unique Serial Number.</p>
          </div>
        ) : isSearching ? (
          <div className="p-8 text-center text-slate-500 animate-pulse text-sm font-medium">Searching gear...</div>
        ) : results.length === 0 ? (
          <div className="p-8 text-center text-slate-600 text-sm font-medium">
            No equipment found matching "{query}"
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {results.map((item) => (
              <li key={item.id} className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                      {item.name} {item.brand && <span className="font-normal text-slate-500 ml-1">({item.brand})</span>}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                      SN: <span className="text-slate-700 tracking-wider bg-slate-100 px-1.5 py-0.5 rounded ml-1">{item.serial_number}</span>
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 ml-14 md:ml-0">
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Condition</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded mt-0.5 inline-block
                      ${item.condition === 'Good' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                        item.condition === 'Needs Service' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                        'bg-red-50 text-red-600 border border-red-100'}
                    `}>
                      {item.condition}
                    </span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Category</span>
                    <span className="text-xs font-medium text-slate-700 mt-0.5">
                      {item.equipment_categories?.name || 'Unknown'}
                    </span>
                  </div>
                  <div className="pl-4 border-l border-slate-200">
                    <button
                      onClick={() => {
                        setEditingItem(item);
                        setIsAdding(false);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}
