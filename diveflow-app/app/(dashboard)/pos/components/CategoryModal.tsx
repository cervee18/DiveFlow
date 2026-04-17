'use client';

import { useState } from 'react';
import { createCategory } from '../actions';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: any[];
}

export default function CategoryModal({ isOpen, onClose, categories }: CategoryModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleSave() {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    const res = await createCategory(name.trim());
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setName('');
      // We don't necessarily close the modal so they can add multiple, but let's just close it or let them see it in the list.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col max-h-screen">
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-semibold text-slate-800">Manage Categories</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            ✕
          </button>
        </div>
        
        <div className="p-5 flex-1 overflow-y-auto">
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="New Category Name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave();
              }}
            />
            <button
              onClick={handleSave}
              disabled={loading || !name.trim()}
              className="px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mb-4">{error}</p>}

          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Existing Categories</h3>
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No categories yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {categories.map(c => (
                <div key={c.id} className="flex justify-between items-center px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-sm font-medium text-slate-700">{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
