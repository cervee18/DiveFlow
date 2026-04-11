'use client';

import { useTransition, useState, useEffect } from 'react';
import {
  setTripTypePrice,
  setTripTypeBillingMode,
  setCourseIncludedTrips,
  setPrivateInstructionPrice,
  setRentalPrice,
  setTripPricingTiers,
  setRentalDailyCap,
} from '../actions';

interface Tier {
  min_qty: number;
  unit_price: number;
}

interface AutomatedBillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripTypes: any[];
  courses: any[];
  rentalMappings: any[];
  privateInstructionPrice: string;
  rentalDailyCap: string;
  tiersMap: Record<string, Tier[]>;
}

const RENTAL_GEAR_FIELDS = [
  { id: 'mask',      label: 'Mask' },
  { id: 'fins',      label: 'Fins' },
  { id: 'bcd',       label: 'BCD' },
  { id: 'regulator', label: 'Regulator' },
  { id: 'wetsuit',   label: 'Wetsuit' },
  { id: 'computer',  label: 'Computer' },
  { id: 'nitrox',    label: 'Nitrox Tank' },
];

function getPrice(obj: any): string {
  if (!obj || !obj.pos_products || obj.pos_products.price == null) return '';
  return Number(obj.pos_products.price).toFixed(2);
}

// ─── PriceInputRow ────────────────────────────────────────────────────────────

function PriceInputRow({
  label,
  initialPrice,
  onSave,
  placeholder = 'Free (Not billed)',
  isPending,
  compact = false,
}: {
  label: string;
  initialPrice: string;
  onSave: (price: string) => Promise<void>;
  placeholder?: string;
  isPending: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState(initialPrice);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => { setValue(initialPrice); }, [initialPrice]);

  const handleBlur = async () => {
    if (value === initialPrice) return;
    await onSave(value);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  const inputEl = (
    <div className="relative w-full max-w-[160px]">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <span className="text-slate-400 sm:text-sm">$</span>
      </div>
      <input
        type="number" min="0" step="0.01"
        placeholder={placeholder}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={isPending}
        className={`w-full pl-7 pr-8 py-2 text-sm text-slate-800 rounded-lg bg-white border outline-none transition-colors ${isPending ? 'opacity-50' : ''} ${isSaved ? 'border-emerald-400' : 'border-slate-200 focus:border-teal-400 focus:ring-1 focus:ring-teal-400'}`}
      />
      {isSaved && !isPending && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );

  if (compact) return inputEl;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 gap-4 hover:bg-slate-50/30 transition-colors">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {inputEl}
    </div>
  );
}

// ─── IntInputRow ──────────────────────────────────────────────────────────────

function IntInputRow({
  label,
  unit,
  initialValue,
  onSave,
  isPending,
  compact = false,
}: {
  label: string;
  unit: string;
  initialValue: number;
  onSave: (v: number) => Promise<void>;
  isPending: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState(String(initialValue));
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => { setValue(String(initialValue)); }, [initialValue]);

  const handleBlur = async () => {
    const parsed = parseInt(value, 10);
    const safe = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    if (safe === initialValue) return;
    await onSave(safe);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  const inputEl = (
    <div className="relative flex items-center gap-2">
      <input
        type="number" min="0" step="1"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={isPending}
        className={`w-20 px-3 py-2 text-sm text-slate-800 rounded-lg bg-white border outline-none transition-colors text-center ${isPending ? 'opacity-50' : ''} ${isSaved ? 'border-emerald-400' : 'border-slate-200 focus:border-teal-400 focus:ring-1 focus:ring-teal-400'}`}
      />
      <span className="text-xs text-slate-400 shrink-0">{unit}</span>
      {isSaved && !isPending && (
        <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );

  if (compact) return inputEl;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-4 gap-4 hover:bg-slate-50/30 transition-colors">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {inputEl}
    </div>
  );
}

// ─── TierEditor ───────────────────────────────────────────────────────────────

function TierEditor({
  tripTypeId,
  initialTiers,
  isPending,
  onSave,
}: {
  tripTypeId: string;
  initialTiers: Tier[];
  isPending: boolean;
  onSave: (tiers: Tier[]) => Promise<void>;
}) {
  type DraftTier = { min_qty: string; unit_price: string };
  const [tiers, setTiers] = useState<DraftTier[]>(
    initialTiers.map(t => ({ min_qty: String(t.min_qty), unit_price: String(t.unit_price) }))
  );
  const [isDirty, setIsDirty] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const enabled = tiers.length > 0;

  const enable = () => {
    setTiers([{ min_qty: '1', unit_price: '' }]);
    setIsDirty(true);
  };

  const addTier = () => {
    const lastQty = tiers.length > 0 ? (parseInt(tiers[tiers.length - 1].min_qty) || 0) + 3 : 1;
    setTiers(prev => [...prev, { min_qty: String(lastQty), unit_price: '' }]);
    setIsDirty(true);
  };

  const removeTier = (i: number) => {
    setTiers(prev => prev.filter((_, idx) => idx !== i));
    setIsDirty(true);
  };

  const update = (i: number, field: keyof DraftTier, val: string) => {
    setTiers(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t));
    setIsDirty(true);
  };

  const handleSave = async () => {
    const parsed = tiers
      .map(t => ({ min_qty: parseInt(t.min_qty) || 0, unit_price: parseFloat(t.unit_price) || 0 }))
      .filter(t => t.min_qty >= 1 && t.unit_price > 0)
      .sort((a, b) => a.min_qty - b.min_qty);
    await onSave(parsed);
    setIsDirty(false);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleRemoveAll = async () => {
    setTiers([]);
    setIsDirty(false);
    await onSave([]);
  };

  if (!enabled) {
    return (
      <button
        onClick={enable}
        className="mt-2 text-xs text-teal-600 hover:text-teal-700 font-semibold hover:underline transition-colors"
      >
        + Volume tiers
      </button>
    );
  }

  return (
    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
        Volume tiers — retroactive within visit
      </p>

      {tiers.map((tier, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-10 shrink-0">from</span>
          <input
            type="number" min="1"
            value={tier.min_qty}
            onChange={e => update(i, 'min_qty', e.target.value)}
            className="w-14 px-2 py-1.5 text-xs text-center border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-400"
          />
          <span className="text-xs text-slate-400 shrink-0">trips →</span>
          <div className="relative w-24">
            <span className="absolute inset-y-0 left-2 flex items-center text-slate-400 text-xs pointer-events-none">$</span>
            <input
              type="number" min="0" step="0.01"
              value={tier.unit_price}
              placeholder="0.00"
              onChange={e => update(i, 'unit_price', e.target.value)}
              className="w-full pl-5 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-teal-400"
            />
          </div>
          <button
            onClick={() => removeTier(i)}
            className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1 flex-wrap">
        <button onClick={addTier} className="text-xs text-teal-600 font-semibold hover:underline">
          + Add tier
        </button>
        {isDirty && (
          <button
            onClick={handleSave}
            disabled={isPending}
            className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1 rounded-lg font-semibold disabled:opacity-50 transition-colors"
          >
            Save
          </button>
        )}
        {isSaved && !isDirty && (
          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}
        <button onClick={handleRemoveAll} className="text-xs text-slate-400 hover:text-red-500 transition-colors ml-auto">
          Remove tiers
        </button>
      </div>
    </div>
  );
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  subtitle,
  count,
  defaultOpen = false,
  headerExtra,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(p => !p)}
        className="w-full flex items-center justify-between px-5 py-3 bg-slate-50/50 hover:bg-slate-100/60 transition-colors text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
            {count !== undefined && (
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full">{count}</span>
            )}
          </div>
          {subtitle && !isOpen && (
            <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {headerExtra && <div onClick={e => e.stopPropagation()}>{headerExtra}</div>}
          <svg
            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <>
          {subtitle && (
            <div className="px-5 py-2 bg-slate-50/30 border-b border-slate-100">
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          )}
          <div className="divide-y divide-slate-100 bg-white">
            {children}
          </div>
        </>
      )}
    </section>
  );
}

// ─── RentalCapInput ───────────────────────────────────────────────────────────

function RentalCapInput({
  initialCap,
  isPending,
  onSave,
}: {
  initialCap: string;
  isPending: boolean;
  onSave: (cap: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialCap);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => { setValue(initialCap); }, [initialCap]);

  const handleBlur = async () => {
    if (value === initialCap) return;
    await onSave(value);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="flex items-center gap-2" title="Daily rental cap">
      <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Daily cap</span>
      <div className="relative w-28">
        <span className="absolute inset-y-0 left-2 flex items-center text-slate-400 text-xs pointer-events-none">$</span>
        <input
          type="number" min="0" step="0.01"
          value={value}
          placeholder="no cap"
          onChange={e => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          disabled={isPending}
          className={`w-full pl-5 pr-2 py-1.5 text-xs border rounded-lg bg-white focus:outline-none transition-colors ${isSaved ? 'border-emerald-400' : 'border-slate-200 focus:border-teal-400'} ${isPending ? 'opacity-50' : ''}`}
        />
      </div>
      {isSaved && (
        <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function AutomatedBillingModal({
  isOpen,
  onClose,
  tripTypes,
  courses,
  rentalMappings,
  privateInstructionPrice,
  rentalDailyCap,
  tiersMap,
}: AutomatedBillingModalProps) {
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const makeAsync = <T extends any[]>(fn: (...args: T) => void): ((...args: T) => Promise<void>) =>
    (...args) => new Promise<void>(resolve => startTransition(async () => { await fn(...args); resolve(); }));

  const handleTripTypePrice   = makeAsync((id: string, name: string, price: string) => setTripTypePrice(id, name, price));
  const handleTripTypeBilling = (id: string, via: boolean) => startTransition(async () => setTripTypeBillingMode(id, via));
  const handleCourseIncluded  = makeAsync((id: string, n: number) => setCourseIncludedTrips(id, n));
  const handlePrivateGuide    = makeAsync((price: string) => setPrivateInstructionPrice(price));
  const handleRental          = makeAsync((field: string, label: string, price: string) => setRentalPrice(field, label, price));
  const handleTiers           = makeAsync((id: string, tiers: Tier[]) => setTripPricingTiers(id, tiers));
  const handleRentalCap       = makeAsync((cap: string) => setRentalDailyCap(cap));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Automated Billing Matrix</h2>
            <p className="text-xs text-slate-500 mt-1">Configure what gets charged automatically — everything else is entered at the sell terminal.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded hover:bg-slate-200">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-3">

          {/* TRIP TYPES */}
          <CollapsibleSection
            title="Trip Types"
            count={tripTypes.length}
            subtitle="Set the base price and tanks per trip. Use volume tiers for retroactive bulk discounts. Pool / class trips should be set to 'Not charged'."
            defaultOpen
          >
            {tripTypes.map(t => {
              const isNotCharged = !!t.billing_via_activity;
              const tiers = tiersMap[t.id] ?? [];
              return (
                <div key={t.id} className="px-5 py-4 hover:bg-slate-50/30 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-700 shrink-0">{t.name}</span>
                    <div className="flex items-center gap-3 ml-auto flex-wrap justify-end">

                      {/* Charged / Not charged toggle */}
                      <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                        <button
                          onClick={() => isNotCharged && handleTripTypeBilling(t.id, false)}
                          disabled={isPending || !isNotCharged}
                          className={`px-3 py-1.5 transition-colors ${!isNotCharged ? 'bg-slate-800 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'} disabled:cursor-default`}
                        >Charged</button>
                        <button
                          onClick={() => !isNotCharged && handleTripTypeBilling(t.id, true)}
                          disabled={isPending || isNotCharged}
                          className={`px-3 py-1.5 transition-colors border-l border-slate-200 ${isNotCharged ? 'bg-violet-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'} disabled:cursor-default`}
                        >Not charged</button>
                      </div>

                      {!isNotCharged && (
                        <>
                          <PriceInputRow
                            label=""
                            initialPrice={getPrice(t)}
                            isPending={isPending}
                            compact
                            onSave={(price) => handleTripTypePrice(t.id, t.name, price)}
                          />
                        </>
                      )}

                      {isNotCharged && (
                        <span className="text-xs text-violet-500 font-medium italic">pool / class — not charged</span>
                      )}
                    </div>
                  </div>

                  {/* Tier editor — only for charged trip types */}
                  {!isNotCharged && (
                    <div className="mt-1 pl-1">
                      <TierEditor
                        tripTypeId={t.id}
                        initialTiers={tiers}
                        isPending={isPending}
                        onSave={(newTiers) => handleTiers(t.id, newTiers)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {tripTypes.length === 0 && (
              <div className="px-5 py-4 text-sm text-slate-400 italic">No trip types found.</div>
            )}
          </CollapsibleSection>

          {/* COURSES */}
          <CollapsibleSection
            title="Course Trip Allowance"
            count={courses.length}
            subtitle="How many trips each course covers. When a course is added at checkout, the system automatically waives that many trips from the client's charges."
          >
            {courses.map(c => (
              <IntInputRow
                key={c.id}
                label={c.name}
                unit="trips included"
                initialValue={c.included_trips ?? 0}
                isPending={isPending}
                onSave={(n) => handleCourseIncluded(c.id, n)}
              />
            ))}
            {courses.length === 0 && (
              <div className="px-5 py-4 text-sm text-slate-400 italic">No courses found.</div>
            )}
          </CollapsibleSection>

          {/* PRIVATE GUIDE FEE */}
          <section className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-sm">Private Guide Fee</h3>
              <p className="text-xs text-slate-400 mt-0.5">Charged once per trip where the diver is marked as private. The trip charge is also applied.</p>
            </div>
            <div className="bg-white">
              <PriceInputRow
                label="Private Guide"
                initialPrice={privateInstructionPrice}
                isPending={isPending}
                onSave={handlePrivateGuide}
              />
            </div>
          </section>

          {/* GEAR RENTALS */}
          <CollapsibleSection
            title="Gear Rentals"
            count={RENTAL_GEAR_FIELDS.length}
            subtitle="Rental is charged once per day regardless of how many trips the client dives. The daily cap limits the total rental charge per client per day."
            headerExtra={
              <RentalCapInput
                initialCap={rentalDailyCap}
                isPending={isPending}
                onSave={handleRentalCap}
              />
            }
          >
            {RENTAL_GEAR_FIELDS.map(gear => {
              const currentMapping = rentalMappings.find(rm => rm.rental_field === gear.id);
              return (
                <PriceInputRow
                  key={gear.id}
                  label={`Gear: ${gear.label}`}
                  initialPrice={getPrice(currentMapping)}
                  isPending={isPending}
                  onSave={(price) => handleRental(gear.id, gear.label, price)}
                />
              );
            })}
          </CollapsibleSection>

        </div>
      </div>
    </div>
  );
}
