'use client';

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { type UnitSystem } from '@/app/(dashboard)/components/OrgSettingsContext';

const CURRENCIES = [
  { value: 'EUR', label: 'EUR — Euro (€)' },
  { value: 'USD', label: 'USD — US Dollar ($)' },
  { value: 'GBP', label: 'GBP — British Pound (£)' },
  { value: 'AUD', label: 'AUD — Australian Dollar (A$)' },
  { value: 'THB', label: 'THB — Thai Baht (฿)' },
  { value: 'IDR', label: 'IDR — Indonesian Rupiah (Rp)' },
  { value: 'PHP', label: 'PHP — Philippine Peso (₱)' },
  { value: 'MXN', label: 'MXN — Mexican Peso ($)' },
  { value: 'HRK', label: 'HRK — Croatian Kuna (kn)' },
  { value: 'EGP', label: 'EGP — Egyptian Pound (E£)' },
];

// ── Unit system toggle ────────────────────────────────────────────────────────
function UnitToggle({
  value,
  onChange,
}: {
  value: UnitSystem;
  onChange: (v: UnitSystem) => void;
}) {
  return (
    <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit">
      {(['metric', 'imperial'] as UnitSystem[]).map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-5 py-2 text-sm font-medium transition-colors capitalize ${
            value === opt
              ? 'bg-teal-500 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {opt === 'metric' ? 'Metric (m, kg)' : 'Imperial (ft, lbs)'}
        </button>
      ))}
    </div>
  );
}

// ── Setting row ───────────────────────────────────────────────────────────────
function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-slate-100 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GeneralSettings({
  orgId,
  initialUnitSystem,
  initialCurrency,
}: {
  orgId: string;
  initialUnitSystem: UnitSystem;
  initialCurrency: string;
}) {
  const supabase = createClient();

  const [unitSystem, setUnitSystem] = useState<UnitSystem>(initialUnitSystem);
  const [currency,   setCurrency]   = useState(initialCurrency);
  const [isSaving,   setIsSaving]   = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const isDirty =
    unitSystem !== initialUnitSystem ||
    currency   !== initialCurrency;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    const { error } = await supabase
      .from('organizations')
      .update({ unit_system: unitSystem, currency })
      .eq('id', orgId);
    if (error) { setError(error.message); setIsSaving(false); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setIsSaving(false);
    // Reload so the OrgSettingsProvider in the layout re-fetches the new values
    window.location.reload();
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Block header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">General Settings</h2>
          <p className="text-xs text-slate-400 mt-0.5">Dive center–wide preferences</p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-6 py-2 bg-rose-50 border-b border-rose-100 text-xs text-rose-600">
          {error}
        </div>
      )}

      {/* Settings rows */}
      <div className="px-6">
        <SettingRow
          label="Unit System"
          description="Controls how depths and distances are displayed across the app"
        >
          <UnitToggle value={unitSystem} onChange={setUnitSystem} />
        </SettingRow>

        <SettingRow
          label="Currency"
          description="Used in POS invoices and pricing"
        >
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="text-sm px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white"
          >
            {CURRENCIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
            {/* Show current value even if not in list */}
            {!CURRENCIES.some(c => c.value === currency) && (
              <option value={currency}>{currency}</option>
            )}
          </select>
        </SettingRow>
      </div>

      {/* Save footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
        {saved && (
          <span className="text-xs font-medium text-teal-600 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Saved
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className="px-4 py-2 text-sm font-semibold bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </section>
  );
}
