export const PERMISSIONS = {
  PAGE_OVERVIEW:          'page:overview',
  PAGE_POS:               'page:pos',
  PAGE_STAFF:             'page:staff',
  PAGE_INVOICES:          'page:invoices',
  PAGE_MANAGEMENT:        'page:management',
  PAGE_LOGS:              'page:logs',
  OVERVIEW_CREATE_TRIP:   'overview:create_trip',
  OVERVIEW_CONFIRM_TRIP:  'overview:confirm_trip',
  STAFF_MOVE_STAFF:       'staff:move_staff',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

// Used by the permission matrix UI
export const PERMISSION_GROUPS: { label: string; items: { key: Permission; label: string }[] }[] = [
  {
    label: 'Page Access',
    items: [
      { key: PERMISSIONS.PAGE_OVERVIEW,   label: 'Overview' },
      { key: PERMISSIONS.PAGE_POS,        label: 'Point of Sale' },
      { key: PERMISSIONS.PAGE_STAFF,      label: 'Staff Board' },
      { key: PERMISSIONS.PAGE_INVOICES,   label: 'Invoices' },
      { key: PERMISSIONS.PAGE_MANAGEMENT, label: 'Management' },
      { key: PERMISSIONS.PAGE_LOGS,       label: 'Activity Logs' },
    ],
  },
  {
    label: 'Overview',
    items: [
      { key: PERMISSIONS.OVERVIEW_CREATE_TRIP,  label: 'Create trips' },
      { key: PERMISSIONS.OVERVIEW_CONFIRM_TRIP, label: 'Confirm trips' },
    ],
  },
  {
    label: 'Staff Board',
    items: [
      { key: PERMISSIONS.STAFF_MOVE_STAFF, label: 'Staff Assignment' },
    ],
  },
];

// Maps URL path prefixes to the permission key that gates them
export const PAGE_PERMISSION_MAP: Record<string, Permission> = {
  '/overview':   PERMISSIONS.PAGE_OVERVIEW,
  '/pos':        PERMISSIONS.PAGE_POS,
  '/staff':      PERMISSIONS.PAGE_STAFF,
  '/invoices':   PERMISSIONS.PAGE_INVOICES,
  '/management': PERMISSIONS.PAGE_MANAGEMENT,
  '/logs':       PERMISSIONS.PAGE_LOGS,
};

export const STAFF_ROLES = ['staff_1', 'staff_2', 'staff_3', 'staff_4'] as const;
export type StaffRole = typeof STAFF_ROLES[number];
