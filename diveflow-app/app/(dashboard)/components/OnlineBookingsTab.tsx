'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

interface Guest {
  name: string;
  email?: string;
}

interface OnlineBooking {
  id: string;
  status: 'held' | 'confirmed' | 'cancelled' | 'expired';
  hold_expires_at: string | null;
  lead_name: string;
  lead_email: string | null;
  lead_phone: string | null;
  pax_count: number;
  guests: Guest[];
  created_at: string;
}

const STATUS_STYLES: Record<OnlineBooking['status'], string> = {
  confirmed: 'bg-emerald-100 text-emerald-700',
  held:      'bg-amber-100  text-amber-700',
  expired:   'bg-slate-100  text-slate-500',
  cancelled: 'bg-rose-100   text-rose-600',
};

const STATUS_LABELS: Record<OnlineBooking['status'], string> = {
  confirmed: 'Confirmed',
  held:      'Hold',
  expired:   'Expired',
  cancelled: 'Cancelled',
};

function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(diff === 0 ? 'Expired' : `${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return <span className="text-xs text-amber-600 tabular-nums">{remaining}</span>;
}

function BookingCard({
  booking,
  onCancel,
  isCancelling,
}: {
  booking: OnlineBooking;
  onCancel: () => void;
  isCancelling: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const canCancel = booking.status === 'held' || booking.status === 'confirmed';

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3 bg-white">
        {/* Status badge */}
        <span className={`mt-0.5 shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[booking.status]}`}>
          {STATUS_LABELS[booking.status]}
        </span>

        {/* Lead info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-slate-800 truncate">{booking.lead_name}</span>
            <span className="text-xs text-slate-400 shrink-0">{booking.pax_count} {booking.pax_count === 1 ? 'person' : 'people'}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {booking.lead_email && (
              <span className="text-xs text-slate-500 truncate">{booking.lead_email}</span>
            )}
            {booking.lead_phone && (
              <span className="text-xs text-slate-500">{booking.lead_phone}</span>
            )}
          </div>
          {booking.status === 'held' && booking.hold_expires_at && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-slate-400">Expires in</span>
              <HoldCountdown expiresAt={booking.hold_expires_at} />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {booking.guests.length > 1 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title={expanded ? 'Hide guests' : 'Show guests'}
            >
              <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
          {canCancel && (
            <button
              onClick={onCancel}
              disabled={isCancelling}
              title="Cancel booking"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
            >
              {isCancelling ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Guest list */}
      {expanded && booking.guests.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 space-y-1">
          {booking.guests.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-4 text-right shrink-0">{i + 1}.</span>
              <span className="text-xs text-slate-700">{g.name}</span>
              {g.email && <span className="text-xs text-slate-400">{g.email}</span>}
              {i === 0 && <span className="text-[10px] text-teal-600 font-semibold">lead</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OnlineBookingsTab({ tripId, onBookingChange }: {
  tripId: string;
  onBookingChange?: () => void;
}) {
  const supabase = createClient();
  const [bookings, setBookings]       = useState<OnlineBooking[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('online_bookings')
      .select('id, status, hold_expires_at, lead_name, lead_email, lead_phone, pax_count, guests, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    if (data) setBookings(data as OnlineBooking[]);
    if (error) setError(error.message);
    setIsLoading(false);
  }, [supabase, tripId]);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (bookingId: string) => {
    if (!window.confirm('Cancel this booking?')) return;
    setCancellingId(bookingId);
    const { error } = await supabase
      .from('online_bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId);
    if (error) {
      setError(error.message);
    } else {
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b));
      onBookingChange?.();
    }
    setCancellingId(null);
  };

  const active   = bookings.filter(b => b.status === 'confirmed' || b.status === 'held');
  const inactive = bookings.filter(b => b.status === 'cancelled' || b.status === 'expired');
  const totalPax = active.reduce((s, b) => s + b.pax_count, 0);

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</div>
      )}

      {/* Summary bar */}
      {bookings.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span><span className="font-semibold text-slate-700">{active.length}</span> active booking{active.length !== 1 ? 's' : ''}</span>
          <span><span className="font-semibold text-slate-700">{totalPax}</span> {totalPax === 1 ? 'person' : 'people'} reserved</span>
          <button onClick={load} className="ml-auto text-teal-600 hover:text-teal-700 font-medium">Refresh</button>
        </div>
      )}

      {/* Active bookings */}
      {active.length > 0 && (
        <div className="space-y-2">
          {active.map(b => (
            <BookingCard
              key={b.id}
              booking={b}
              onCancel={() => handleCancel(b.id)}
              isCancelling={cancellingId === b.id}
            />
          ))}
        </div>
      )}

      {/* Inactive bookings (collapsed by default) */}
      {inactive.length > 0 && (
        <details className="group">
          <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none list-none flex items-center gap-1">
            <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            {inactive.length} cancelled / expired
          </summary>
          <div className="mt-2 space-y-2">
            {inactive.map(b => (
              <BookingCard
                key={b.id}
                booking={b}
                onCancel={() => handleCancel(b.id)}
                isCancelling={cancellingId === b.id}
              />
            ))}
          </div>
        </details>
      )}

      {bookings.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-400">
          No online bookings for this trip yet.
        </div>
      )}
    </div>
  );
}
