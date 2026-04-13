'use client';

import { useState } from 'react';
import { useOrgSettings } from '@/app/(dashboard)/components/OrgSettingsContext';
import VesselsConfig   from './VesselsConfig';
import DiveSitesConfig from './DiveSitesConfig';
import TripTypesConfig from './TripTypesConfig';
import GeneralSettings from './GeneralSettings';
import StaffAllocator  from './StaffAllocator';

type SectionId = 'general' | 'boats' | 'divesites' | 'trips' | 'team';

const SECTIONS: { id: SectionId; label: string; description: string }[] = [
  { id: 'general',   label: 'General',    description: 'Dive center–wide preferences' },
  { id: 'boats',     label: 'Boats',      description: 'Vessels available for trips' },
  { id: 'divesites', label: 'Dive Sites', description: 'Sites used in trip logs and dive records' },
  { id: 'trips',     label: 'Trip Types', description: 'Types of trips offered, grouped by category' },
  { id: 'team',      label: 'Team',       description: 'Staff allocation and roles' },
];

export default function ConfigurationClient({ orgId }: { orgId: string | null }) {
  const [section, setSection] = useState<SectionId>('general');
  const { unitSystem, currency } = useOrgSettings();

  const active = SECTIONS.find(s => s.id === section)!;

  return (
    <div className="flex h-full bg-slate-50">

      {/* Section sidebar */}
      <aside className="w-44 border-r border-slate-200 bg-white flex flex-col pt-8 px-3 gap-1 flex-shrink-0">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
          Sections
        </p>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              section === s.id
                ? 'bg-teal-50 text-teal-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">

          {/* Section header */}
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{active.label}</h1>
            <p className="text-sm text-slate-500 mt-1">{active.description}</p>
          </div>

          {/* Section content */}
          {!orgId ? (
            <div className="text-sm text-slate-400 py-10 text-center">Loading…</div>
          ) : (
            <>
              {section === 'general'   && (
                <GeneralSettings
                  orgId={orgId}
                  initialUnitSystem={unitSystem}
                  initialCurrency={currency}
                />
              )}
              {section === 'boats'     && <VesselsConfig orgId={orgId} />}
              {section === 'divesites' && <DiveSitesConfig orgId={orgId} />}
              {section === 'trips'     && <TripTypesConfig orgId={orgId} />}
              {section === 'team'      && <StaffAllocator adminOrgId={orgId} />}
            </>
          )}

        </div>
      </div>

    </div>
  );
}
