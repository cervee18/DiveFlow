import { getTodayStr } from './dateUtils';

interface OverviewTopBarProps {
  windowStart: string;
  onWindowStartChange: (date: string) => void;
  totalTrips: number;
  isLoading: boolean;
  isPanelOpen: boolean;
  onTogglePanel: () => void;
}

export default function OverviewTopBar({
  windowStart,
  onWindowStartChange,
  totalTrips,
  isLoading,
  isPanelOpen,
  onTogglePanel,
}: OverviewTopBarProps) {
  const isToday = windowStart === getTodayStr();

  return (
    <div className="px-8 py-5 flex items-center justify-between gap-6 shrink-0 border-b border-slate-200 bg-white">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {isLoading
            ? 'Loading…'
            : `${totalTrips} trip${totalTrips !== 1 ? 's' : ''} · next 15 days`}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Add to Trips toggle */}
        <button
          onClick={onTogglePanel}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
            isPanelOpen
              ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
              : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400 hover:text-teal-600'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add to Trips
        </button>

        {!isToday && (
          <button
            onClick={() => onWindowStartChange(getTodayStr())}
            className="px-3 py-2 text-sm font-medium text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-300 rounded-lg bg-white transition-colors"
          >
            Today
          </button>
        )}

        <div className="relative">
          <input
            type="date"
            value={windowStart}
            onChange={e => e.target.value && onWindowStartChange(e.target.value)}
            className="pl-9 pr-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          />
          <svg
            className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
