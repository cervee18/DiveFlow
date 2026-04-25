const pad = (n: number) => String(n).padStart(2, '0');

export function getTodayStr(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
}

export function localHour(timestamp: string): number {
  return new Date(timestamp).getUTCHours();
}
