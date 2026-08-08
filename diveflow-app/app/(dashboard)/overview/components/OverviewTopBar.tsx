import DatePicker from '../../components/DatePicker';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'Dive',    label: 'Dive'    },
  { value: 'Snorkel', label: 'Snorkel' },
  { value: 'Class',   label: 'Class'   },
  { value: 'Pool',    label: 'Pool'    },
];

interface OverviewTopBarProps {
  windowStart: string;
  onWindowStartChange: (date: string) => void;
  totalTrips: number;
  isLoading: boolean;
  isPanelOpen: boolean;
  onTogglePanel: () => void;
  categoryFilter: string | null;
  onCategoryFilterChange: (category: string | null) => void;
}

export default function OverviewTopBar({
  windowStart,
  onWindowStartChange,
  totalTrips,
  isLoading,
  isPanelOpen,
  onTogglePanel,
  categoryFilter,
  onCategoryFilterChange,
}: OverviewTopBarProps) {
  return (
    <div className="px-4 lg:px-6 py-4 flex items-center gap-4 shrink-0 border-b border-slate-200 bg-white">
      {/* Title + subtitle */}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-semibold text-slate-800">Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {isLoading
            ? 'Loading…'
            : `${totalTrips} trip${totalTrips !== 1 ? 's' : ''} · next 15 days`}
        </p>
      </div>

      {/* Category filter pills */}
      <div className="flex items-center gap-1.5">
        {CATEGORIES.map(({ value, label }) => {
          const active = categoryFilter === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onCategoryFilterChange(active ? null : value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                active
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-teal-300 hover:text-teal-600'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Right: bulk add + date picker */}
      <button
        onClick={onTogglePanel}
        className={`hidden lg:flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
          isPanelOpen
            ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
            : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400 hover:text-teal-600'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add to Trips
      </button>

      <DatePicker value={windowStart} onChange={onWindowStartChange} />
    </div>
  );
}
