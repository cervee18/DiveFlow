'use client';

import DatePicker from '../../components/DatePicker';

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
        <h1 className="text-2xl font-semibold text-slate-800">Staff Schedule</h1>
        {!isLoading && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {totalTrips} {totalTrips === 1 ? 'trip' : 'trips'}
          </span>
        )}
        {isLoading && (
          <span className="text-xs text-slate-400 animate-pulse">Loading…</span>
        )}
      </div>

      <DatePicker value={selectedDate} onChange={onDateChange} />
    </div>
  );
}
