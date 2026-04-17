'use client';

import { useState, useEffect } from 'react';
import { upsertProduct } from '../actions';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: any[];
  courses: any[];
  editingProduct?: any | null;
}

export default function ProductModal({ isOpen, onClose, categories, courses, editingProduct }: ProductModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('0.00');
  const [isAutomated, setIsAutomated] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [courseId, setCourseId] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingProduct) {
      setName(editingProduct.name ?? '');
      setDescription(editingProduct.description ?? '');
      setCategoryId(editingProduct.category_id ?? '');
      setPrice(Number(editingProduct.price ?? 0).toFixed(2));
      setIsAutomated(!!editingProduct.is_automated);
      setIsActive(!!editingProduct.is_active);
      setCourseId(editingProduct.course_id ?? '');
    } else {
      setName('');
      setDescription('');
      setCategoryId('');
      setPrice('0.00');
      setIsAutomated(false);
      setIsActive(true);
      setCourseId('');
    }
  }, [editingProduct, isOpen]);

  if (!isOpen) return null;

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      setError('Invalid price');
      return;
    }

    setLoading(true);
    setError('');

    const res = await upsertProduct({
      id: editingProduct?.id,
      name: name.trim(),
      description: description.trim(),
      category_id: categoryId,
      price: numPrice,
      is_automated: isAutomated,
      is_active: isActive,
      course_id: courseId || null,
    });

    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">
            {editingProduct ? 'Edit Product' : 'New Product'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded hover:bg-slate-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Product Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              placeholder="e.g. BCD Rental, Custom T-Shirt"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 bg-white"
              >
                <option value="">No Category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Price ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          {courses.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Linked Course <span className="normal-case font-normal text-slate-400">(optional — waives trips when added to tab)</span>
              </label>
              <select
                value={courseId}
                onChange={e => setCourseId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 bg-white"
              >
                <option value="">No course link</option>
                {courses.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.included_trips} trip{c.included_trips !== 1 ? 's' : ''} waived)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description (Optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              placeholder="Internal notes or extended details"
            />
          </div>

          <div className="border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50/50 mt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  checked={isAutomated}
                  onChange={e => setIsAutomated(e.target.checked)}
                  className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700">Automated Billing Ledger</span>
                <span className="text-xs text-slate-500 leading-snug mt-0.5">Check this if this product represents an operational item (Trip, Rental, Course). Automated items are mapped behind the scenes and dynamically charged.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-700">Active</span>
                <span className="text-xs text-slate-500 leading-snug mt-0.5">Disable this to hide the product from new invoices without deleting historical data.</span>
              </div>
            </label>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </div>
    </div>
  );
}
