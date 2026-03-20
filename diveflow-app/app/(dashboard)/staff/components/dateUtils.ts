// All helpers use local time to avoid UTC drift

export function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Returns the local hour (0–23) for a timestamp string */
export function localHour(timestamp: string): number {
  return new Date(timestamp).getHours();
}
