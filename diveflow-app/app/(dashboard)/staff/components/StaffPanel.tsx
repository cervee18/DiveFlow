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
  onToggle: (id: string) => void;
  onClear: () => void;
}

function memberInitials(s: StaffMember): string {
  if (s.initials) return s.initials;
  return `${s.first_name?.[0] ?? ''}${s.last_name?.[0] ?? ''}`.toUpperCase() || '?';
}

export default function StaffPanel({ staff, selectedIds, onToggle, onClear }: StaffPanelProps) {
  const hasSelection = selectedIds.length > 0;

  return (
    <div className="w-52 shrink-0 flex flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">Staff</h2>
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
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-1">
        {staff.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center pt-8">No staff found</p>
        ) : (
          staff.map(member => {
            const isSelected = selectedIds.includes(member.id);
            return (
              <button
                key={member.id}
                onClick={() => onToggle(member.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                  isSelected
                    ? 'bg-teal-50 border border-teal-300 ring-1 ring-teal-200'
                    : 'border border-transparent hover:bg-slate-50 hover:border-slate-200'
                }`}
              >
                {/* Initials chip */}
                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold leading-none shrink-0 ${
                  isSelected ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {memberInitials(member)}
                </span>
                {/* Name */}
                <span className={`text-xs font-medium truncate ${
                  isSelected ? 'text-teal-700' : 'text-slate-600'
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
