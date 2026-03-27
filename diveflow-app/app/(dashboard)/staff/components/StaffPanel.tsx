'use client';

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
  onToggle: (id: string) => void;
  onClear: () => void;
}

function memberInitials(s: StaffMember): string {
  if (s.initials) return s.initials;
  return `${s.first_name?.[0] ?? ''}${s.last_name?.[0] ?? ''}`.toUpperCase() || '?';
}

export default function StaffPanel({ staff, selectedIds, unassignedIds = [], onToggle, onClear }: StaffPanelProps) {
  const hasSelection   = selectedIds.length > 0;
  const unassignedCount = unassignedIds.length;

  return (
    <div className="w-[332px] shrink-0 flex flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-700">Staff</h2>
            {unassignedCount > 0 && !hasSelection && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                {unassignedCount} unassigned
              </span>
            )}
          </div>
          {hasSelection && (
            <button
              onClick={onClear}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        {hasSelection && (
          <p className="text-[11px] text-teal-600 font-medium mt-1">
            {selectedIds.length} selected — click a trip to assign
          </p>
        )}
      </div>

      {/* Staff list */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3 grid grid-cols-1 sm:grid-cols-2 gap-1 content-start">
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
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 sm:px-2.5 justify-center sm:justify-start rounded-lg text-left transition-all ${
                  isSelected
                    ? 'bg-teal-50 border border-teal-300 ring-1 ring-teal-200'
                    : isUnassigned
                      ? 'border border-amber-300 bg-amber-50 hover:bg-amber-100'
                      : 'border border-transparent hover:bg-slate-50 hover:border-slate-200'
                }`}
              >
                {/* Initials chip */}
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold leading-none shrink-0 ${
                  isSelected   ? 'bg-teal-500 text-white'
                  : isUnassigned ? 'bg-amber-400 text-white'
                  : 'bg-slate-200 text-slate-600'
                }`}>
                  {memberInitials(member)}
                </span>
                {/* Name */}
                <span className={`hidden sm:inline text-xs font-medium truncate ${
                  isSelected   ? 'text-teal-700'
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
      {!hasSelection && (
        <div className="shrink-0 px-4 py-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 text-center leading-snug">
            Select staff members,<br />then click a trip card
          </p>
        </div>
      )}
    </div>
  );
}
