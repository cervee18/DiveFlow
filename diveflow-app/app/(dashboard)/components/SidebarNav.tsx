'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

// ── Icons ────────────────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 22V12h6v10" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 3" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4m0 0a7 7 0 100 14 7 7 0 000-14" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7a5 5 0 110 10A5 5 0 0112 7z" />
    </svg>
  );
}

function UserCircleIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface Props {
  isStaff: boolean;
  isAdmin: boolean;
  userEmail: string;
  isPOSOpen?: boolean;
}

// ── NavLink ──────────────────────────────────────────────────────────────────

function NavLink({
  item,
  isActive,
  expanded,
}: {
  item: NavItem;
  isActive: boolean;
  expanded: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={!expanded ? item.label : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? 'bg-teal-500/10 text-teal-400'
          : 'text-slate-400 hover:bg-slate-800 hover:text-teal-400'
      }`}
    >
      {item.icon}
      {expanded && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

// ── AccordionGroup ────────────────────────────────────────────────────────────

function AccordionGroup({
  label,
  items,
  storageKey,
  expanded,
  hasActiveChild,
  isActiveChild,
  indicator,
}: {
  label: string;
  items: NavItem[];
  storageKey: string;
  expanded: boolean;
  hasActiveChild: boolean;
  isActiveChild: (href: string) => boolean;
  indicator?: 'green' | 'red';
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) setOpen(stored === 'true');
  }, [storageKey]);

  // Auto-expand when navigating into this section
  useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [hasActiveChild]);

  const toggle = () => {
    setOpen(prev => {
      localStorage.setItem(storageKey, String(!prev));
      return !prev;
    });
  };

  const ledColor = indicator === 'green' ? 'bg-emerald-400' : indicator === 'red' ? 'bg-rose-500' : null;

  // Narrow (icon-only): show all items flat with a divider, ignore accordion state
  if (!expanded) {
    return (
      <div className="mt-1">
        <div className="relative border-t border-slate-700/50 my-2 mx-2">
          {ledColor && (
            <span className={`absolute -top-1.5 right-1 w-2 h-2 rounded-full ${ledColor} ring-1 ring-slate-900`} />
          )}
        </div>
        {items.map(item => (
          <NavLink
            key={item.href}
            item={item}
            isActive={isActiveChild(item.href)}
            expanded={false}
          />
        ))}
      </div>
    );
  }

  // Expanded: full accordion with header and chevron
  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {hasActiveChild && !open && (
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
          )}
          <span>{label}</span>
          {ledColor && (
            <span className={`w-2 h-2 rounded-full ${ledColor} flex-shrink-0`} />
          )}
        </div>
        <ChevronDownIcon open={open} />
      </button>

      {open && (
        <div className="mt-1 flex flex-col gap-1">
          {items.map(item => (
            <NavLink
              key={item.href}
              item={item}
              isActive={isActiveChild(item.href)}
              expanded={true}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export default function SidebarNav({ isStaff, isAdmin, userEmail, isPOSOpen }: Props) {
  const [hovered, setHovered] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const expanded = hovered;

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const mainItems: NavItem[] = [
    { href: '/',         label: 'Dashboard', icon: <HomeIcon /> },
    ...(isStaff ? [
      { href: '/overview', label: 'Overview',   icon: <GridIcon /> },
      { href: '/clients',  label: 'Clients',    icon: <UsersIcon /> },
      { href: '/staff',    label: 'Staff',      icon: <BadgeIcon /> },
    ] : []),
  ];

  const adminItems: NavItem[] = isAdmin ? [
    { href: '/management', label: 'Configuration', icon: <CogIcon /> },
    { href: '/logs',       label: 'Logs',       icon: <ListIcon /> },
    { href: '/statistics', label: 'Statistics', icon: <ChartIcon /> },
    { href: '/inventory',  label: 'Inventory',  icon: <BoxIcon /> },
  ] : [];

  const posItems: NavItem[] = isAdmin ? [
    { href: '/pos/open-close', label: 'Open / Close', icon: <PowerIcon /> },
    { href: '/pos/sell',       label: 'Sell',          icon: <CartIcon /> },
    { href: '/pos/products',   label: 'Products',      icon: <TagIcon /> },
    { href: '/pos/tabs',       label: 'Client Tabs',   icon: <ReceiptIcon /> },
    { href: '/pos/history',    label: 'History',       icon: <ClockIcon /> },
    { href: '/pos/logs',       label: 'Activity Log',  icon: <ActivityIcon /> },
  ] : [];

  return (
    // This outer div always occupies w-16 in the layout — prevents content shift on hover
    <div className="hidden md:block w-16 flex-shrink-0 relative">
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`absolute top-0 left-0 h-full flex flex-col bg-slate-900 border-r border-slate-700/50 z-30 transition-[width] duration-200 ease-in-out overflow-hidden ${
          expanded ? 'w-52 shadow-xl shadow-black/30' : 'w-16'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center border-b border-slate-700/50 px-4 flex-shrink-0">
          <div className="w-8 h-8 bg-teal-500 rounded-md flex items-center justify-center shadow-sm flex-shrink-0">
            <span className="text-white font-bold text-xl leading-none">D</span>
          </div>
          {expanded && (
            <span className="ml-2 text-xl font-bold text-white tracking-tight whitespace-nowrap">
              DiveFlow
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 overflow-y-auto overflow-x-hidden flex flex-col gap-1">
          {mainItems.map(item => (
            <NavLink
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              expanded={expanded}
            />
          ))}

          {adminItems.length > 0 && (
            <AccordionGroup
              label="Admin"
              items={adminItems}
              storageKey="sidebar-admin-open"
              expanded={expanded}
              hasActiveChild={adminItems.some(i => isActive(i.href))}
              isActiveChild={isActive}
            />
          )}

          {posItems.length > 0 && (
            <AccordionGroup
              label="Point of Sale"
              items={posItems}
              storageKey="sidebar-pos-open"
              expanded={expanded}
              hasActiveChild={posItems.some(i => isActive(i.href))}
              isActiveChild={isActive}
              indicator={isPOSOpen ? 'green' : 'red'}
            />
          )}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-3 border-t border-slate-700/50 flex flex-col gap-1 flex-shrink-0">
          {expanded && (
            <div className="px-3 py-1 text-xs font-medium text-slate-500 truncate">
              {userEmail}
            </div>
          )}

          <NavLink
            item={{ href: '/profile', label: 'My Profile', icon: <UserCircleIcon /> }}
            isActive={isActive('/profile')}
            expanded={expanded}
          />

          <button
            onClick={handleSignOut}
            title={!expanded ? 'Sign Out' : undefined}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors w-full"
          >
            <SignOutIcon />
            {expanded && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </div>
  );
}
