'use client';

import { useState } from 'react';
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

function CartIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
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

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  isStaff: boolean;
  isAdmin: boolean;
  userEmail: string;
  isPOSOpen?: boolean;
}

// ── NavLink ──────────────────────────────────────────────────────────────────

function NavLink({
  href,
  label,
  icon,
  isActive,
  expanded,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  expanded: boolean;
}) {
  return (
    <Link
      href={href}
      title={!expanded ? label : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? 'bg-teal-500/10 text-teal-400'
          : 'text-slate-400 hover:bg-slate-800 hover:text-teal-400'
      }`}
    >
      {icon}
      {expanded && <span className="truncate">{label}</span>}
    </Link>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

const ADMIN_ROOTS = ['/management', '/logs', '/statistics', '/inventory'];

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

  const isAdminActive = ADMIN_ROOTS.some(p => pathname.startsWith(p));
  const isPOSActive   = pathname.startsWith('/pos');

  const ledColor = isPOSOpen ? 'bg-emerald-400' : 'bg-rose-500';

  const posIcon = (
    <span className="relative inline-flex flex-shrink-0">
      <CartIcon />
      <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${ledColor} ring-1 ring-slate-900`} />
    </span>
  );

  return (
    <div className="hidden md:block w-16 flex-shrink-0 sticky top-0 h-screen z-50">
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`absolute top-0 left-0 h-full flex flex-col bg-slate-900 border-r border-slate-700/50 z-50 transition-[width] duration-200 ease-in-out overflow-hidden ${
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
          <NavLink href="/"         label="Dashboard" icon={<HomeIcon />}    isActive={isActive('/')}        expanded={expanded} />

          {isStaff && <>
            <NavLink href="/overview" label="Overview"  icon={<GridIcon />}   isActive={isActive('/overview')} expanded={expanded} />
            <NavLink href="/clients"  label="Clients"   icon={<UsersIcon />}  isActive={isActive('/clients')}  expanded={expanded} />
            <NavLink href="/staff"    label="Staff"     icon={<BadgeIcon />}  isActive={isActive('/staff')}    expanded={expanded} />
          </>}

          {isAdmin && <>
            <div className="border-t border-slate-700/50 my-2 mx-1" />
            <NavLink href="/management" label="Admin"          icon={<CogIcon />}  isActive={isAdminActive} expanded={expanded} />
            <NavLink href="/pos/sell"   label="Point of Sale"  icon={posIcon}      isActive={isPOSActive}   expanded={expanded} />
          </>}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-3 border-t border-slate-700/50 flex flex-col gap-1 flex-shrink-0">
          {expanded && (
            <div className="px-3 py-1 text-xs font-medium text-slate-500 truncate">
              {userEmail}
            </div>
          )}

          <NavLink
            href="/profile"
            label="My Profile"
            icon={<UserCircleIcon />}
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
