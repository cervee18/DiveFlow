'use client';

import { useTransition, useState, useEffect } from 'react';
import { setTripTypePrice, setActivityPrice, setCoursePrice, setRentalPrice } from '../actions';

interface AutomatedBillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripTypes: any[];
  activities: any[];
  courses: any[];
  rentalMappings: any[];
}

const RENTAL_GEAR_FIELDS = [
  { id: 'mask', label: 'Mask' },
  { id: 'fins', label: 'Fins' },
  { id: 'bcd', label: 'BCD' },
  { id: 'regulator', label: 'Regulator' },
  { id: 'wetsuit', label: 'Wetsuit' },
  { id: 'computer', label: 'Computer' },
  { id: 'nitrox', label: 'Nitrox Tank' }
];

function getPrice(obj: any): string {
  if (!obj || !obj.pos_products || obj.pos_products.price === null || obj.pos_products.price === undefined) return '';
  return Number(obj.pos_products.price).toFixed(2);
}

function PriceInputRow({ 
  label, 
  initialPrice, 
  onSave, 
  placeholder = "Free (Not billed)",
  isPending 
}: { 
  label: string; 
  initialPrice: string; 
  onSave: (price: string) => Promise<void>; 
  placeholder?: string;
  isPending: boolean;
}) {
  const [value, setValue] = useState(initialPrice);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setValue(initialPrice);
  }, [initialPrice]);

  const handleBlur = async () => {
    if (value === initialPrice) return;
    await onSave(value);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 gap-4 hover:bg-slate-50/30 transition-colors">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="relative w-full max-w-[160px]">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span className="text-slate-400 sm:text-sm">$</span>
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder={placeholder}
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          className={`w-full pl-7 pr-8 py-2 text-sm text-slate-800 rounded-lg bg-white border outline-none transition-colors ${
            isPending ? 'opacity-50' : ''
          } ${
            isSaved ? 'border-emerald-400 focus:ring-1 focus:ring-emerald-500' : 'border-slate-200 focus:border-teal-400 focus:ring-1 focus:ring-teal-400'
          }`}
        />
        {isSaved && !isPending && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AutomatedBillingModal({ isOpen, onClose, tripTypes, activities, courses, rentalMappings }: AutomatedBillingModalProps) {
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleTripTypeChange = (id: string, name: string, price: string) => {
    return new Promise<void>(resolve => {
      startTransition(async () => {
        await setTripTypePrice(id, name, price);
        resolve();
      });
    });
  };

  const handleActivityChange = (id: string, name: string, price: string) => {
    return new Promise<void>(resolve => {
      startTransition(async () => {
        await setActivityPrice(id, name, price);
        resolve();
      });
    });
  };

  const handleCourseChange = (id: string, name: string, price: string) => {
    return new Promise<void>(resolve => {
      startTransition(async () => {
        await setCoursePrice(id, name, price);
        resolve();
      });
    });
  };

  const handleRentalChange = (rentalField: string, label: string, price: string) => {
    return new Promise<void>(resolve => {
      startTransition(async () => {
        await setRentalPrice(rentalField, label, price);
        resolve();
      });
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Automated Billing Matrix</h2>
            <p className="text-xs text-slate-500 mt-1">Set prices to automatically generate master ledger SKUs.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded hover:bg-slate-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* TRIPS */}
          <section className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-sm">Trip Types</h3>
            </div>
            <div className="divide-y divide-slate-100 bg-white">
              {tripTypes.map(t => (
                <PriceInputRow 
                  key={t.id} 
                  label={t.name} 
                  initialPrice={getPrice(t)} 
                  isPending={isPending}
                  onSave={(price) => handleTripTypeChange(t.id, t.name, price)} 
                />
              ))}
              {tripTypes.length === 0 && <div className="px-5 py-4 text-sm text-slate-400 italic">No trip types found.</div>}
            </div>
          </section>

          {/* ACTIVITIES */}
          <section className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-sm">Add-On Activities</h3>
            </div>
            <div className="divide-y divide-slate-100 bg-white">
              {activities.map(a => (
                <PriceInputRow 
                  key={a.id} 
                  label={a.name} 
                  initialPrice={getPrice(a)} 
                  isPending={isPending}
                  onSave={(price) => handleActivityChange(a.id, a.name, price)} 
                />
              ))}
              {activities.length === 0 && <div className="px-5 py-4 text-sm text-slate-400 italic">No activities found.</div>}
            </div>
          </section>

          {/* COURSES */}
          <section className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-sm">Courses</h3>
            </div>
            <div className="divide-y divide-slate-100 bg-white">
              {courses.map(c => (
                <PriceInputRow 
                  key={c.id} 
                  label={c.name} 
                  initialPrice={getPrice(c)} 
                  isPending={isPending}
                  onSave={(price) => handleCourseChange(c.id, c.name, price)} 
                />
              ))}
              {courses.length === 0 && <div className="px-5 py-4 text-sm text-slate-400 italic">No courses found.</div>}
            </div>
          </section>

          {/* RENTALS */}
          <section className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm">Gear Rentals</h3>
            </div>
            <div className="divide-y divide-slate-100 bg-white">
              {RENTAL_GEAR_FIELDS.map(gear => {
                const currentMapping = rentalMappings.find(rm => rm.rental_field === gear.id);
                return (
                  <PriceInputRow 
                    key={gear.id} 
                    label={`Gear: ${gear.label}`} 
                    initialPrice={getPrice(currentMapping)} 
                    isPending={isPending}
                    onSave={(price) => handleRentalChange(gear.id, gear.label, price)} 
                  />
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
