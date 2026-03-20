'use client';

interface StaffTopBarProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  totalTrips: number;
  isLoading: boolean;
}

export default function StaffTopBar({
  selectedDate,
  onDateChange,
  totalTrips,
  isLoading,
}: StaffTopBarProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-8 py-4 bg-white border-b border-slate-200 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-slate-800">Staff Schedule</h1>
        {!isLoading && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {totalTrips} {totalTrips === 1 ? 'trip' : 'trips'}
          </span>
        )}
        {isLoading && (
          <span className="text-xs text-slate-400 animate-pulse">Loading…</span>
        )}
      </div>

      <div className="relative flex items-center gap-2">
        {/* Calendar icon */}
        <svg
          className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8"  y1="2" x2="8"  y2="6" />
          <line x1="3"  y1="10" x2="21" y2="10" />
        </svg>
        <input
          type="date"
          value={selectedDate}
          onChange={e => onDateChange(e.target.value)}
          className="pl-9 pr-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent"
        />
      </div>
    </div>
  );
}
