'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

const TIMEOUT_MS = 10 * 60 * 1000;

const SS_LOCKED        = 'pos_locked';
const SS_LAST_ACTIVITY = 'pos_last_activity';

export default function POSInactivityGuard({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail: string;
}) {
  const router = useRouter();
  const [locked, setLocked]     = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const timerRef                = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    sessionStorage.setItem(SS_LOCKED, '1');
    sessionStorage.removeItem(SS_LAST_ACTIVITY);
    setLocked(true);
  }, []);

  const unlock = useCallback(() => {
    sessionStorage.removeItem(SS_LOCKED);
    sessionStorage.removeItem(SS_LAST_ACTIVITY);
    setLocked(false);
  }, []);

  const resetTimer = useCallback(() => {
    sessionStorage.setItem(SS_LAST_ACTIVITY, String(Date.now()));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(lock, TIMEOUT_MS);
  }, [lock]);

  // On mount: check both the explicit lock flag and elapsed time since last activity
  useEffect(() => {
    if (sessionStorage.getItem(SS_LOCKED) === '1') {
      setLocked(true);
      return;
    }
    const last = Number(sessionStorage.getItem(SS_LAST_ACTIVITY) ?? 0);
    if (last && Date.now() - last >= TIMEOUT_MS) {
      lock();
    }
  }, [lock]);

  // Inactivity timer + visibilitychange check (handles browser timer throttling)
  useEffect(() => {
    if (!locked) resetTimer();

    const events = ['mousemove', 'keydown', 'click', 'touchstart'] as const;
    const onActivity = () => { if (!locked) resetTimer(); };
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    const onVisibility = () => {
      if (locked || document.visibilityState !== 'visible') return;
      const last = Number(sessionStorage.getItem(SS_LAST_ACTIVITY) ?? 0);
      if (last && Date.now() - last >= TIMEOUT_MS) lock();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [locked, resetTimer, lock]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password,
    });

    setLoading(false);
    if (authError) {
      setError('Incorrect password. Please try again.');
      setPassword('');
    } else {
      unlock();
      setPassword('');
      resetTimer();
    }
  };

  return (
    <>
      {children}

      {locked && (
        <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center">
          <div className="w-full max-w-sm mx-4">

            {/* Logo */}
            <div className="flex justify-center mb-8">
              <div className="w-12 h-12 bg-teal-500 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-2xl leading-none">D</span>
              </div>
            </div>

            {/* Lock icon */}
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>

            <h2 className="text-center text-white text-xl font-semibold mb-1">
              POS Session Locked
            </h2>
            <p className="text-center text-slate-400 text-sm mb-8">
              Locked after 10 minutes of inactivity.
              <br />Enter your password to continue.
            </p>

            <form onSubmit={handleUnlock} className="flex flex-col gap-3">
              <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-400 truncate select-none">
                {userEmail}
              </div>

              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus
                required
                className="bg-slate-800 border border-slate-700 focus:border-teal-500 focus:outline-none rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-colors"
              />

              {error && (
                <p className="text-rose-400 text-xs text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="mt-1 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
              >
                {loading ? 'Verifying…' : 'Unlock'}
              </button>

              <button
                type="button"
                onClick={() => router.push('/')}
                className="text-slate-500 hover:text-slate-300 text-sm font-medium py-1.5 transition-colors"
              >
                Exit POS
              </button>
            </form>

          </div>
        </div>
      )}
    </>
  );
}
