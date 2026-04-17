'use client';

interface ProductCatalogProps {
  manualProducts: any[];
  categories: any[];
  searchQuery: string;
  selectedCategoryId: string | null;
  isPending: boolean;
  filteredProducts: any[];
  onSearchChange: (v: string) => void;
  onCategoryChange: (id: string | null) => void;
  onAddItem: (product: any) => void;
}

export default function ProductCatalog({
  categories,
  searchQuery,
  selectedCategoryId,
  isPending,
  filteredProducts,
  onSearchChange,
  onCategoryChange,
  onAddItem,
}: ProductCatalogProps) {
  return (
    <div className="w-1/3 bg-slate-50/50 flex flex-col pt-6 overflow-hidden">
      <div className="px-6 mb-4 shrink-0">
        <h2 className="text-lg font-bold text-slate-800 mb-3">Retail Catalog</h2>
        <div className="relative mb-3">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search product..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>
        <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
          <button
            onClick={() => onCategoryChange(null)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${!selectedCategoryId ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
          >All Items</button>
          {categories.map((cat: any) => (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategoryId === cat.id ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
            >{cat.name}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map((p: any) => (
            <button
              key={p.id}
              onClick={() => onAddItem(p)}
              disabled={isPending}
              className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-teal-300 transition-all text-left flex flex-col justify-between h-24 disabled:opacity-50 group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-teal-50 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-200 ease-out z-0" />
              <span className="text-sm font-semibold text-slate-700 relative z-10 leading-tight line-clamp-2">{p.name}</span>
              <span className="text-sm text-teal-600 font-mono font-medium relative z-10">${Number(p.price).toFixed(2)}</span>
            </button>
          ))}
        </div>
        {filteredProducts.length === 0 && (
          <p className="text-sm text-slate-400 italic text-center pt-10">No products match this filter.</p>
        )}
      </div>
    </div>
  );
}
