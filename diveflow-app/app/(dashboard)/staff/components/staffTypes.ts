// Shared types for the bubble-select-to-move interaction on the Staff page.

export type BubbleSource =
  | { kind: 'job';           jobTypeId: string; halfDay: 'AM' | 'PM'; customLabel?: string }
  | { kind: 'trip';          tripId: string }
  | { kind: 'trip-activity'; tripId: string; activityId: string; tripStaffId: string };

export interface SelectedBubble {
  staffId: string;
  source:  BubbleSource;
}

export type MoveDestination =
  | { kind: 'job';  jobTypeId: string; halfDay: 'AM' | 'PM'; customLabel?: string }
  | { kind: 'trip'; tripId: string };

export function bubbleKey(b: SelectedBubble): string {
  const s = b.source;
  if (s.kind === 'job')           return `job|${b.staffId}|${s.jobTypeId}|${s.halfDay}|${s.customLabel ?? ''}`;
  if (s.kind === 'trip')          return `trip|${b.staffId}|${s.tripId}`;
  return                                 `act|${b.staffId}|${s.tripId}|${s.activityId}`;
}
