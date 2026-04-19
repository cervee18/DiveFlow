"use client";
import { useState, useMemo } from "react";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function parseDate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function displayDate(s: string): string {
  const d = parseDate(s);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function DateRangePicker({ startDate, endDate, onChange }: DateRangePickerProps) {
  const startD = parseDate(startDate);
  const endD = parseDate(endDate);

  const initialView = startD ?? new Date();
  const [viewDate, setViewDate] = useState(new Date(initialView.getFullYear(), initialView.getMonth(), 1));
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [phase, setPhase] = useState<'start' | 'end'>(startDate && !endDate ? 'end' : 'start');

  const effectiveEnd = useMemo(() => {
    if (endD) return endD;
    if (phase === 'end' && hoverDate && startD && hoverDate >= startD) return hoverDate;
    return null;
  }, [endD, phase, hoverDate, startD]);

  const cells = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysCount = new Date(year, month + 1, 0).getDate();
    const result: (Date | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysCount; d++) result.push(new Date(year, month, d));
    return result;
  }, [viewDate]);

  const handleClick = (day: Date) => {
    if (phase === 'start') {
      onChange(fmt(day), '');
      setPhase('end');
    } else {
      if (!startD || day < startD) {
        onChange(fmt(day), '');
        setPhase('end');
      } else {
        onChange(startDate, fmt(day));
        setPhase('start');
        setHoverDate(null);
      }
    }
  };

  const nightCount = startD && endD
    ? Math.round((endD.getTime() - startD.getTime()) / 86400000)
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Summary bar */}
      <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-2.5 border border-slate-200">
        <div className="flex-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Check-in</p>
          <p className={`text-sm font-medium ${startDate ? 'text-slate-800' : 'text-slate-400'}`}>
            {startDate ? displayDate(startDate) : 'Select date'}
          </p>
        </div>
        <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        <div className="flex-1 text-right">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Check-out</p>
          <p className={`text-sm font-medium ${endDate ? 'text-slate-800' : 'text-slate-400'}`}>
            {endDate ? displayDate(endDate) : (phase === 'end' && startDate ? '...' : 'Select date')}
          </p>
        </div>
      </div>

      {/* Calendar */}
      <div className="border border-slate-200 rounded-lg overflow-hidden select-none">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setViewDate(v => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-700">
            {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
          </span>
          <button
            type="button"
            onClick={() => setViewDate(v => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
            className="p-1 rounded hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1.5">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 p-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} className="h-8" />;

            const isStart = startD ? sameDay(day, startD) : false;
            const isEnd = effectiveEnd ? sameDay(day, effectiveEnd) : false;
            const inRange = startD && effectiveEnd ? day > startD && day < effectiveEnd : false;
            const hasRange = !!(startD && effectiveEnd);

            return (
              <div key={day.toISOString()} className="relative h-8 flex items-center justify-center">
                {/* Range band */}
                {(inRange || (isStart && hasRange) || (isEnd && hasRange)) && (
                  <div className={[
                    'absolute inset-y-1 bg-teal-100',
                    inRange ? 'inset-x-0' : '',
                    isStart && !isEnd ? 'left-1/2 right-0' : '',
                    isEnd && !isStart ? 'left-0 right-1/2' : '',
                  ].join(' ')} />
                )}
                <button
                  type="button"
                  onClick={() => handleClick(day)}
                  onMouseEnter={() => phase === 'end' && setHoverDate(day)}
                  onMouseLeave={() => setHoverDate(null)}
                  className={[
                    'relative z-10 w-8 h-8 rounded-full text-xs flex items-center justify-center transition-colors font-medium',
                    isStart || isEnd ? 'bg-teal-600 text-white' : '',
                    inRange ? 'text-teal-700 hover:bg-teal-200' : '',
                    !isStart && !isEnd && !inRange ? 'text-slate-700 hover:bg-slate-100' : '',
                  ].join(' ')}
                >
                  {day.getDate()}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hint / night count */}
      <p className="text-xs text-slate-400 text-center">
        {nightCount !== null
          ? `${nightCount} night${nightCount !== 1 ? 's' : ''}`
          : !startDate
          ? 'Click to select check-in date'
          : 'Now click to select check-out date'}
      </p>
    </div>
  );
}
