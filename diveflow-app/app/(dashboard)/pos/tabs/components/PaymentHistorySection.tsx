'use client';

import { fmtMoney } from './helpers';

interface PaymentHistorySectionProps {
  payments: any[];
  onVoid: (payment: any) => void;
}

export default function PaymentHistorySection({ payments, onVoid }: PaymentHistorySectionProps) {
  if (payments.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm divide-y divide-slate-100">
      {payments.map((p: any) => {
        const isVoided = !!p.voided_at;
        return (
          <div key={p.id} className={`px-5 py-3 flex items-center justify-between gap-4 ${isVoided ? 'opacity-50' : ''}`}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-semibold ${isVoided ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {p.payment_method}
                </p>
                {isVoided && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-rose-100 text-rose-500 rounded">
                    Voided
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate">
                {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {p.recorded_by_email && <> · {p.recorded_by_email}</>}
              </p>
              {isVoided && p.void_reason && (
                <p className="text-xs text-rose-400 italic mt-0.5">"{p.void_reason}"</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`font-mono font-bold ${isVoided ? 'line-through text-slate-400' : 'text-emerald-600'}`}>
                {fmtMoney(p.amount)}
              </span>
              {!isVoided && (
                <button
                  onClick={() => onVoid(p)}
                  title="Void this payment"
                  className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
