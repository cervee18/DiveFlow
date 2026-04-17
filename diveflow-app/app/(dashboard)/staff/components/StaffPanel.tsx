'use client';

import { SelectedBubble } from './staffTypes';

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  initials: string | null;
}

interface StaffPanelProps {
  staff: StaffMember[];
  selectedIds: string[];
  unassignedIds?: string[];
  selectedTargetCount?: number;
  selectedBubbles?: SelectedBubble[];
  onToggle: (id: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onUnassignBubbles?: () => void;
  onClearBubbles?: () => void;
}

function memberInitials(s: StaffMember): string {
  if (s.initials) return s.initials;
  return `${s.first_name?.[0] ?? ''}${s.last_name?.[0] ?? ''}`.toUpperCase() || '?';
}

export default function StaffPanel({
  staff,
  selectedIds,
  unassignedIds = [],
  selectedTargetCount = 0,
  selectedBubbles = [],
  onToggle,
  onCancel,
  onSave,
  onUnassignBubbles,
  onClearBubbles,
}: StaffPanelProps) {
  const hasSelection    = selectedIds.length > 0;
  const hasBubbles      = selectedBubbles.length > 0;
  const unassignedCount = unassignedIds.length;

  return (
    <div className="w-12 sm:w-[332px] shrink-0 flex flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="shrink-0 px-1 sm:px-4 py-2 sm:py-4 border-b border-slate-200 bg-slate-50">
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-700">Staff</h2>
            {unassignedCount > 0 && !hasSelection && !hasBubbles && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                {unassignedCount} unassigned
              </span>
            )}
          </div>
          {(hasSelection || hasBubbles) && (
            <button
              onClick={hasBubbles ? onClearBubbles : onCancel}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Bubble mode: unassign drop zone */}
        {hasBubbles && (
          <button
            onClick={onUnassignBubbles}
            className="hidden sm:flex mt-2 w-full items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-violet-500 text-white hover:bg-violet-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Unassign {selectedBubbles.length} selected
          </button>
        )}

        {/* Assign mode */}
        {hasSelection && !hasBubbles && (
          <>
            <p className="hidden sm:block text-[11px] text-teal-600 font-medium mt-1">
              {selectedIds.length} selected — click trips or jobs to queue
            </p>
            <button
              onClick={onSave}
              className={`hidden sm:flex mt-2 w-full items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                selectedTargetCount > 0
                  ? 'bg-teal-500 text-white hover:bg-teal-600'
                  : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
              }`}
            >
              {selectedTargetCount > 0 ? `Save assignments (${selectedTargetCount})` : 'Save / Exit'}
            </button>
          </>
        )}
      </div>

      {/* Staff list */}
      <div className="flex-1 overflow-y-auto min-h-0 p-1 sm:p-3 grid grid-cols-1 sm:grid-cols-2 gap-1 content-start">
        {staff.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center pt-8 col-span-2">No staff found</p>
        ) : (
          staff.map(member => {
            const isSelected   = selectedIds.includes(member.id);
            const isUnassigned = !isSelected && unassignedIds.includes(member.id);
            return (
              <button
                key={member.id}
                onClick={() => onToggle(member.id)}
                className={`w-full flex items-center gap-2.5 px-1 sm:px-2.5 py-2 justify-center sm:justify-start rounded-lg text-left transition-all ${
                  isSelected
                    ? 'bg-teal-50 border border-teal-300 ring-1 ring-teal-200'
                    : isUnassigned
                      ? 'border border-amber-300 bg-amber-50 hover:bg-amber-100'
                      : 'border border-transparent hover:bg-slate-50 hover:border-slate-200'
                }`}
              >
                {/* Initials chip */}
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold leading-none shrink-0 ${
                  isSelected    ? 'bg-teal-500 text-white'
                  : isUnassigned ? 'bg-amber-400 text-white'
                  : 'bg-slate-200 text-slate-600'
                }`}>
                  {memberInitials(member)}
                </span>
                {/* Name */}
                <span className={`hidden sm:inline text-xs font-medium truncate ${
                  isSelected    ? 'text-teal-700'
                  : isUnassigned ? 'text-amber-800'
                  : 'text-slate-600'
                }`}>
                  {member.first_name} {member.last_name}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Bottom hint */}
      {!hasSelection && !hasBubbles && (
        <div className="hidden sm:block shrink-0 px-4 py-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 text-center leading-snug">
            Select staff to assign, or click<br />chips on cards to move them
          </p>
        </div>
      )}
    </div>
  );
}
