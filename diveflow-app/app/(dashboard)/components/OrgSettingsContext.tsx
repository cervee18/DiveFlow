'use client';

import { createContext, useContext } from 'react';

export type UnitSystem = 'metric' | 'imperial';

export interface OrgSettings {
  unitSystem: UnitSystem;
  currency:   string;
}

const DEFAULT: OrgSettings = { unitSystem: 'metric', currency: 'EUR' };

export const OrgSettingsContext = createContext<OrgSettings>(DEFAULT);

export function OrgSettingsProvider({
  settings,
  children,
}: {
  settings: OrgSettings;
  children: React.ReactNode;
}) {
  return (
    <OrgSettingsContext.Provider value={settings}>
      {children}
    </OrgSettingsContext.Provider>
  );
}

export function useOrgSettings(): OrgSettings {
  return useContext(OrgSettingsContext);
}

// ── Depth helpers ─────────────────────────────────────────────────────────────

/** Convert metres to feet (rounded to nearest whole number). */
export function mToFt(m: number): number {
  return Math.round(m * 3.28084);
}

/** Format a depth value stored in metres for display. */
export function formatDepth(metres: number, system: UnitSystem): string {
  if (system === 'imperial') return `${mToFt(metres)} ft`;
  return `${metres} m`;
}

/** Return the depth unit label. */
export function depthUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'ft' : 'm';
}

/** Parse a depth input value back to metres for storage. */
export function inputToMetres(value: number, system: UnitSystem): number {
  if (system === 'imperial') return Math.round((value / 3.28084) * 10) / 10;
  return value;
}
