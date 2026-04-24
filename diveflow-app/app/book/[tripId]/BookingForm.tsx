'use client';

import { useState, useEffect } from 'react';

interface TripInfo {
  trip_id: string;
  start_time: string;
  duration_minutes: number;
  trip_type: string | null;
  dive_site: string | null;
  max_divers: number;
  available_spaces: number;
  price_per_person: number | null;
}

interface Guest {
  name: string;
  email: string;
}

type Step = 'select-pax' | 'details' | 'payment' | 'success';

function formatPrice(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function HoldCountdown({ expiresAt, onExpired }: { expiresAt: string; onExpired: () => void }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      if (diff === 0) { setRemaining('00:00'); onExpired(); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);

  const isLow = parseInt(remaining) < 2;

  return (
    <span className={`font-mono font-bold tabular-nums ${isLow ? 'text-rose-600' : 'text-amber-600'}`}>
      {remaining}
    </span>
  );
}

export default function BookingForm({ trip }: { trip: TripInfo }) {
  const [step, setStep]           = useState<Step>('select-pax');
  const [paxCount, setPaxCount]   = useState(1);
  const [guests, setGuests]       = useState<Guest[]>([{ name: '', email: '' }]);
  const [leadPhone, setLeadPhone] = useState('');
  const [holdId, setHoldId]       = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const maxPax = Math.min(trip.available_spaces, 10);

  // Sync guests array length to paxCount
  useEffect(() => {
    setGuests(prev => {
      const next = [...prev];
      while (next.length < paxCount) next.push({ name: '', email: '' });
      return next.slice(0, paxCount);
    });
  }, [paxCount]);

  const setGuest = (i: number, field: keyof Guest, val: string) => {
    setGuests(prev => prev.map((g, idx) => idx === i ? { ...g, [field]: val } : g));
  };

  const handleReserve = async () => {
    setIsLoading(true);
    setError(null);
    const res = await fetch('/api/bookings/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trip_id:    trip.trip_id,
        pax_count:  paxCount,
        lead_name:  guests[0].name,
        lead_email: guests[0].email || undefined,
        lead_phone: leadPhone || undefined,
        guests:     guests.map(g => ({ name: g.name, email: g.email || undefined })),
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setError(data.error ?? 'Could not reserve. Please try again.');
      setIsLoading(false);
      return;
    }
    setHoldId(data.hold_id);
    setExpiresAt(data.expires_at);
    setStep('payment');
    setIsLoading(false);
  };

  const handlePay = async () => {
    if (!holdId) return;
    setIsLoading(true);
    setError(null);
    const res = await fetch('/api/bookings/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hold_id: holdId }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setError(data.error ?? 'Payment failed. Please try again.');
      setIsLoading(false);
      return;
    }
    setStep('success');
    setIsLoading(false);
  };

  const handleHoldExpired = () => {
    setError('Your hold expired. Please start over.');
    setStep('select-pax');
    setHoldId(null);
    setExpiresAt(null);
  };

  // ── Trip summary card (shown on all steps) ──────────────────────────────────
  const TripCard = () => (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-start gap-4">
      <div className="shrink-0 text-center w-12">
        <div className="text-xl font-bold text-slate-800 leading-none">
          {new Date(trip.start_time).getDate()}
        </div>
        <div className="text-[11px] text-slate-400 uppercase tracking-wide mt-0.5">
          {new Date(trip.start_time).toLocaleDateString('en-US', { month: 'short' })}
        </div>
      </div>
      <div className="w-px self-stretch bg-slate-100 shrink-0" />
      <div>
        <div className="font-semibold text-slate-800">{trip.trip_type ?? 'Trip'}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {formatDate(trip.start_time)} · {formatTime(trip.start_time)}
          {trip.dive_site && <> · {trip.dive_site}</>}
        </div>
      </div>
    </div>
  );

  // ── Step: select pax ────────────────────────────────────────────────────────
  if (step === 'select-pax') return (
    <div className="space-y-5">
      <TripCard />
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-5 space-y-4">
        <h2 className="font-semibold text-slate-800">How many people?</h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPaxCount(p => Math.max(1, p - 1))}
            disabled={paxCount <= 1}
            className="w-9 h-9 rounded-full border border-slate-300 text-slate-600 hover:border-teal-400 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-lg font-medium"
          >−</button>
          <span className="text-2xl font-bold text-slate-800 w-6 text-center">{paxCount}</span>
          <button
            onClick={() => setPaxCount(p => Math.min(maxPax, p + 1))}
            disabled={paxCount >= maxPax}
            className="w-9 h-9 rounded-full border border-slate-300 text-slate-600 hover:border-teal-400 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center text-lg font-medium"
          >+</button>
          <span className="text-xs text-slate-400 ml-1">{trip.available_spaces} spots available</span>
        </div>
        {trip.price_per_person != null && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-sm text-slate-500">{formatPrice(trip.price_per_person)} / person</span>
            <span className="text-sm font-semibold text-slate-800">
              Total: {formatPrice(trip.price_per_person * paxCount)}
            </span>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}
      <button
        onClick={() => { setError(null); setStep('details'); }}
        className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-xl transition-colors"
      >
        Continue
      </button>
    </div>
  );

  // ── Step: details ───────────────────────────────────────────────────────────
  if (step === 'details') return (
    <div className="space-y-5">
      <TripCard />
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-5 space-y-5">
        <h2 className="font-semibold text-slate-800">Guest details</h2>

        {guests.map((g, i) => (
          <div key={i} className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {i === 0 ? 'Lead (you)' : `Guest ${i + 1}`}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input
                  value={g.name}
                  onChange={e => setGuest(i, 'name', e.target.value)}
                  placeholder="Full name *"
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <input
                  value={g.email}
                  onChange={e => setGuest(i, 'email', e.target.value)}
                  placeholder={i === 0 ? 'Email *' : 'Email (optional)'}
                  type="email"
                  required={i === 0}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              {i === 0 && (
                <div className="col-span-2 sm:col-span-1">
                  <input
                    value={leadPhone}
                    onChange={e => setLeadPhone(e.target.value)}
                    placeholder="Phone *"
                    type="tel"
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>
              )}
            </div>
            {i < guests.length - 1 && <hr className="border-slate-100" />}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => { setError(null); setStep('select-pax'); }}
          className="px-5 py-3 border border-slate-300 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleReserve}
          disabled={isLoading || guests.some(g => !g.name.trim()) || !guests[0]?.email.trim() || !leadPhone.trim()}
          className="flex-1 py-3 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
        >
          {isLoading ? 'Reserving…' : 'Reserve my spot'}
        </button>
      </div>
    </div>
  );

  // ── Step: payment ───────────────────────────────────────────────────────────
  if (step === 'payment') return (
    <div className="space-y-5">
      <TripCard />

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-3">
        <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-amber-800">Your spot is reserved</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Complete payment within{' '}
            {expiresAt && (
              <HoldCountdown expiresAt={expiresAt} onExpired={handleHoldExpired} />
            )}
            {' '}or your reservation will be released.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Booking summary</p>
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">{paxCount} {paxCount === 1 ? 'person' : 'people'}</span>
          {trip.price_per_person != null ? (
            <span className="text-slate-600">{formatPrice(trip.price_per_person)} × {paxCount}</span>
          ) : (
            <span className="text-slate-400 italic">Price TBD</span>
          )}
        </div>
        {trip.price_per_person != null && (
          <div className="flex justify-between text-sm font-semibold border-t border-slate-100 pt-2">
            <span className="text-slate-700">Total</span>
            <span className="text-slate-800">{formatPrice(trip.price_per_person * paxCount)}</span>
          </div>
        )}
        <div className="pt-1 space-y-0.5">
          {guests.map((g, i) => (
            <div key={i} className="text-xs text-slate-400 flex gap-2">
              <span className="w-4">{i + 1}.</span>
              <span>{g.name}</span>
              {g.email && <span className="text-slate-300">{g.email}</span>}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Fake payment button — replace with Plug n Pay embed */}
      <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-xs text-center text-slate-400 font-medium">— Payment gateway (demo) —</p>
        <button
          onClick={handlePay}
          disabled={isLoading}
          className="w-full py-3 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
        >
          {isLoading
            ? 'Processing…'
            : trip.price_per_person != null
              ? `Pay ${formatPrice(trip.price_per_person * paxCount)} (simulated)`
              : 'Pay now (simulated)'
          }
        </button>
      </div>
    </div>
  );

  // ── Step: success ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 text-center">
      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-800">You&apos;re booked!</h2>
        <p className="text-sm text-slate-500 mt-1">
          Your spot on <span className="font-medium">{trip.trip_type ?? 'the trip'}</span> on{' '}
          {formatDate(trip.start_time)} is confirmed.
        </p>
      </div>
      <TripCard />
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 text-left space-y-1">
        {guests.map((g, i) => (
          <div key={i} className="text-sm text-slate-600 flex gap-2">
            <span className="text-slate-400 w-4">{i + 1}.</span>
            <span>{g.name}</span>
            {g.email && <span className="text-slate-400 text-xs">{g.email}</span>}
          </div>
        ))}
      </div>
      <a
        href="/book"
        className="inline-block text-sm text-teal-600 hover:text-teal-700 font-medium"
      >
        ← Back to trips
      </a>
    </div>
  );
}
