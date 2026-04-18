'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface TabItem {
  href: string;
  label: string;
}

const POS_TABS: TabItem[] = [
  { href: '/pos/open-close', label: 'Open / Close' },
  { href: '/pos/sell',       label: 'Sell' },
  { href: '/pos/products',   label: 'Products' },
  { href: '/pos/tabs',       label: 'Client Tabs' },
  { href: '/pos/invoices',   label: 'Invoices' },
  { href: '/pos/logs',       label: 'Activity Log' },
];

const ADMIN_TABS: TabItem[] = [
  { href: '/management', label: 'Configuration' },
  { href: '/logs',       label: 'Logs' },
  { href: '/statistics', label: 'Statistics' },
  { href: '/inventory',  label: 'Inventory' },
];

const ADMIN_ROOTS = ['/management', '/logs', '/statistics', '/inventory'];

export default function SubNavBar({ isPOSOpen }: { isPOSOpen: boolean }) {
  const pathname = usePathname();

  const inPOS   = pathname.startsWith('/pos');
  const inAdmin = !inPOS && ADMIN_ROOTS.some(p => pathname.startsWith(p));

  if (!inPOS && !inAdmin) return null;

  const tabs         = inPOS ? POS_TABS : ADMIN_TABS;
  const sectionLabel = inPOS ? 'Point of Sale' : 'Admin';

  return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-20 flex-shrink-0">
      <div className="flex items-center px-4 gap-0.5 h-10">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-3 select-none">
          {sectionLabel}
        </span>

        {tabs.map(tab => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                active
                  ? 'bg-teal-500/10 text-teal-600'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}

        {inPOS && (
          <span className={`ml-auto flex items-center gap-1.5 text-xs font-medium ${isPOSOpen ? 'text-emerald-600' : 'text-rose-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isPOSOpen ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            {isPOSOpen ? 'Session open' : 'Session closed'}
          </span>
        )}
      </div>
    </div>
  );
}
