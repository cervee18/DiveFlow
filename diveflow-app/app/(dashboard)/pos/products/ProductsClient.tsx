'use client';

import { useState } from 'react';
import CategoryModal from '../components/CategoryModal';
import ProductModal from '../components/ProductModal';
import AutomatedBillingModal from '../components/AutomatedBillingModal';

export default function ProductsClient({ 
  products, 
  categories,
  tripTypes,
  activities,
  courses,
  rentalMappings 
}: { 
  products: any[]; 
  categories: any[];
  tripTypes: any[];
  activities: any[];
  courses: any[];
  rentalMappings: any[];
}) {
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isAutomatedModalOpen, setIsAutomatedModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);

  function openEdit(p: any) {
    setEditingProduct(p);
    setIsProductModalOpen(true);
  }

  function openNew() {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Products Catalog</h1>
          <p className="text-sm text-slate-500 mt-1">Manage POS items, gear rentals, and merchandise pricing.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsAutomatedModalOpen(true)}
            className="px-4 py-2 border border-slate-200 text-slate-700 bg-indigo-50 hover:bg-indigo-100 font-medium rounded-lg text-sm transition-colors shadow-sm"
          >
            Automated Mappings
          </button>
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-4 py-2 border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-medium rounded-lg text-sm transition-colors shadow-sm"
          >
            Categories
          </button>
          <button 
            onClick={openNew}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
          >
            + New Product
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <svg className="w-12 h-12 text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            <h3 className="text-sm font-semibold text-slate-700">No products found</h3>
            <p className="text-xs text-slate-500 mt-1">Get started by creating your first catalog item.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Item Name</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Price</th>
                  <th className="px-6 py-4 text-center">Type</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{product.name}</div>
                      {product.description && (
                         <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{product.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {product.pos_categories ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                          {product.pos_categories.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-xs">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-700">
                      ${Number(product.price).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {product.is_automated ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100" title="Automatically billed via Tripy/Rental tracking">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                          </svg>
                          Automated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                          Manual Sale
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {product.is_active ? (
                        <span className="inline-flex items-center w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" title="Active"></span>
                      ) : (
                        <span className="inline-flex items-center w-2 h-2 rounded-full bg-slate-300 ring-2 ring-slate-100" title="Inactive"></span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => openEdit(product)}
                        className="text-teal-600 hover:text-teal-700 font-semibold text-xs bg-teal-50 hover:bg-teal-100 px-2.5 py-1.5 rounded transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
      />
      <ProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        categories={categories}
        editingProduct={editingProduct}
      />
      <AutomatedBillingModal
        isOpen={isAutomatedModalOpen}
        onClose={() => setIsAutomatedModalOpen(false)}
        tripTypes={tripTypes}
        activities={activities}
        courses={courses}
        rentalMappings={rentalMappings}
      />
    </>
  );
}
