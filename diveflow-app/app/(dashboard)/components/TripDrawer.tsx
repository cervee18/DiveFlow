'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import TripDrawerHeader from './TripDrawerHeader';
import TripManifest from '@/app/(dashboard)/trips/components/TripManifest';
import TripFormModal from '@/app/(dashboard)/components/TripFormModal';
import PostTripLog from './PostTripLog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TripDrawerProps {
  /** Whether the drawer is visible. */
  isOpen: boolean;
  /** ID of the trip to display. Set to null to close without animation. */
  tripId: string | null;
  /** Called when the user requests to close the drawer. */
  onClose: () => void;
  /**
   * Called after a successful edit, delete, or manifest change so the parent
   * can refresh its own data (e.g. re-fetch the overview board).
   */
  onSuccess?: () => void;
  /**
   * Optional: called when a diver is moved to a different trip via the manifest,
   * so the parent can open that trip in the drawer instead of the current one.
   * Receives the target trip object `{ id, start_time, ... }`.
   */
  onMovedToTrip?: (trip: any) => void;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function DrawerSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-4 animate-pulse">
      <div className="h-5 w-1/3 bg-slate-100 rounded" />
      <div className="h-4 w-1/2 bg-slate-100 rounded" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-slate-100 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TripDrawer({
  isOpen,
  tripId,
  onClose,
  onSuccess,
  onMovedToTrip,
}: TripDrawerProps) {
  const supabase = createClient();

  const [trip, setTrip]         = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  /** Bump to re-fetch the trip header (e.g. after an edit). */
  const [refreshKey, setRefreshKey] = useState(0);
  /** 'manifest' = normal view, 'post-trip' = dive log entry */
  const [drawerMode, setDrawerMode] = useState<'manifest' | 'post-trip'>('manifest');

  // ── Fetch trip data ──────────────────────────────────────────────────────
  const loadTrip = useCallback(async (id: string) => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('trips')
      .select(`
        id, label, start_time, duration_minutes, max_divers, vessel_id, trip_type_id,
        vessels ( name, abbreviation ),
        trip_types ( id, name, default_start_time, number_of_dives, category ),
        trip_staff ( roles ( name ), staff ( id, first_name, last_name, initials ) )
      `)
      .eq('id', id)
      .single();

    if (!error && data) setTrip(data);
    else if (error) console.error('[TripDrawer] fetch error:', error.message);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!tripId) { setTrip(null); return; }
    setDrawerMode('manifest'); // reset to manifest view when trip changes
    loadTrip(tripId);
  }, [tripId, refreshKey, loadTrip]);

  // ── Body scroll lock ─────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!trip) return;
    if (!window.confirm('Are you sure you want to delete this trip? All manifest data will be lost.')) return;
    const { error } = await supabase.from('trips').delete().eq('id', trip.id);
    if (error) { alert('Error deleting trip: ' + error.message); return; }
    onClose();
    onSuccess?.();
  };

  const handleEditSuccess = () => {
    setIsEditOpen(false);
    setRefreshKey(k => k + 1); // re-fetch header data
    onSuccess?.();
  };

  const handleManifestChange = () => {
    onSuccess?.();
  };

  const handleMovedToTrip = (movedTrip: any) => {
    if (onMovedToTrip) {
      onMovedToTrip(movedTrip);
    } else {
      // Default: open the target trip in this same drawer
      setRefreshKey(0); // reset key so useEffect fires when tripId "changes"
      // The parent controls tripId; if no handler provided, just close
      onClose();
      onSuccess?.();
    }
  };

  // ── Keyboard: Escape closes ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, isEditOpen, onClose]);

  if (!isOpen) return null;

  // ── Local date string (timezone-safe) ─────────────────────────────────────
  const tripDateStr = trip
    ? (() => {
        const d = new Date(trip.start_time);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })()
    : undefined;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Trip details"
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-[90vw] max-w-[80rem] bg-white shadow-2xl"
      >
        {isLoading || !trip ? (
          <>
            {/* Minimal header bar while loading */}
            <div className="flex items-center justify-end px-6 py-4 border-b border-slate-200 shrink-0">
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 transition-colors p-1.5 rounded-md hover:bg-slate-100"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {isLoading ? <DrawerSkeleton /> : (
              <div className="flex-1 flex items-center justify-center">
                <span className="text-sm text-slate-400">Trip not found</span>
              </div>
            )}
          </>
        ) : (
          <>
            {/* ── Header ── */}
            <TripDrawerHeader
              trip={trip}
              onEdit={() => setIsEditOpen(true)}
              onDelete={handleDelete}
              onClose={onClose}
            />

            {/* ── Mode tab bar ── */}
            <div className="flex gap-0 border-b border-slate-200 shrink-0 px-6">
              <button
                onClick={() => setDrawerMode('manifest')}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  drawerMode === 'manifest'
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Manifest
              </button>
              <button
                onClick={() => setDrawerMode('post-trip')}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  drawerMode === 'post-trip'
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Post-trip log
              </button>
            </div>

            {/* ── Content (scrollable) ── */}
            <div className="flex-1 overflow-y-auto p-6">
              {drawerMode === 'manifest' ? (
                <TripManifest
                  tripId={trip.id}
                  tripDate={trip.start_time}
                  capacity={trip.max_divers}
                  numberOfDives={trip.trip_types?.number_of_dives ?? 1}
                  tripCategory={trip.trip_types?.category ?? undefined}
                  onManifestChange={handleManifestChange}
                  onMovedToTrip={handleMovedToTrip}
                />
              ) : (
                <PostTripLog
                  trip={trip}
                  onSaved={onSuccess}
                />
              )}
            </div>

            {/* ── Edit modal ── */}
            <TripFormModal
              isOpen={isEditOpen}
              mode="edit"
              tripData={trip}
              selectedDate={tripDateStr}
              onClose={() => setIsEditOpen(false)}
              onSuccess={handleEditSuccess}
            />
          </>
        )}
      </div>
    </>
  );
}
