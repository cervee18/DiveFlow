'use client';

import { createContext, useContext } from 'react';
import type { Permission } from '@/lib/permissions';

// '*' means all permissions (admin)
const PermissionsContext = createContext<string[]>([]);

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: string[];
  children: React.ReactNode;
}) {
  return (
    <PermissionsContext.Provider value={permissions}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermission(key: Permission): boolean {
  const perms = useContext(PermissionsContext);
  return perms.includes('*') || perms.includes(key);
}
