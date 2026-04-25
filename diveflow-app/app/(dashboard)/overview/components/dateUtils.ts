// All time helpers treat timestamps as UTC — times are stored as "clock time = UTC"
// so 08:30Z always means 08:30 at the dive shop, regardless of browser timezone.

const pad = (n: number) => String(n).padStart(2, '0');

export function getTodayStr(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function localDateStr(timestamp: string): string {
  const d = new Date(timestamp);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function hourUTC(timestamp: string): number {
  return new Date(timestamp).getUTCHours();
}

export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  });
}

export function parseDayLabel(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = getTodayStr();
  return {
    dow:        date.toLocaleDateString('en-US', { weekday: 'short' }),
    day:        d,
    mon:        date.toLocaleDateString('en-US', { month: 'short' }),
    isToday:    dateStr === today,
    isTomorrow: dateStr === shiftDate(today, 1),
  };
}
