'use client';

function getTodayStr() {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];
}

function shiftDay(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const result = new Date(y, m - 1, d + delta);
  return new Date(result.getTime() - result.getTimezoneOffset() * 60000)
    .toISOString().split('T')[0];
}

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
}

export default function DatePicker({ value, onChange }: DatePickerProps) {
  const isToday = value === getTodayStr();

  return (
    <div className="flex items-center gap-1">
      {/* Previous day */}
      <button
        onClick={() => onChange(shiftDay(value, -1))}
        className="flex items-center justify-center w-8 h-9 rounded-lg border border-slate-300 bg-white text-slate-500 hover:border-teal-400 hover:text-teal-600 transition-colors shadow-sm"
        title="Previous day"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Date input */}
      <div className="relative">
        <input
          type="date"
          value={value}
          onChange={e => e.target.value && onChange(e.target.value)}
          className="pl-9 pr-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
        />
        <svg
          className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      {/* Next day */}
      <button
        onClick={() => onChange(shiftDay(value, 1))}
        className="flex items-center justify-center w-8 h-9 rounded-lg border border-slate-300 bg-white text-slate-500 hover:border-teal-400 hover:text-teal-600 transition-colors shadow-sm"
        title="Next day"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Today shortcut — only when not on today */}
      {!isToday && (
        <button
          onClick={() => onChange(getTodayStr())}
          className="ml-1 px-3 py-2 text-sm font-medium text-teal-600 hover:text-teal-700 border border-teal-200 hover:border-teal-300 rounded-lg bg-white transition-colors shadow-sm"
        >
          Today
        </button>
      )}
    </div>
  );
}
