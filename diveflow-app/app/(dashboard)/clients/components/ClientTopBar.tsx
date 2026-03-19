import { useState, useRef, useEffect } from "react";

interface ClientTopBarProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchResults: any[];
  isSearching: boolean;
  onSelectClient: (client: any) => void;
  onOpenAddModal: () => void;
}

export default function ClientTopBar({
  searchQuery,
  setSearchQuery,
  searchResults,
  isSearching,
  onSelectClient,
  onOpenAddModal
}: ClientTopBarProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (client: any) => {
    onSelectClient(client);
    setShowDropdown(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    
    // Automatically show the dropdown if there's text, hide it if empty
    if (val.trim()) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };

  return (
    <div className="flex justify-between items-start gap-8 z-20 shrink-0">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Client Directory</h1>
        <p className="text-sm text-slate-500 mt-1">Search, edit, and manage diver profiles.</p>
      </div>

      <div className="flex-1 max-w-2xl relative" ref={searchRef}>
        <div className="relative">
          <input
            type="text"
            placeholder="Search by diver name or email..."
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={() => searchQuery.trim() && setShowDropdown(true)}
            className="w-full px-4 py-3 pl-11 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
          />
          <svg className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {showDropdown && (
          <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
            {isSearching ? (
              <div className="p-4 text-center text-sm text-slate-500">Searching...</div>
            ) : searchResults.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">No divers found.</div>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {searchResults.map((client) => (
                  <li key={client.id}>
                    <button
                      onClick={() => handleSelect(client)}
                      className="w-full text-left px-4 py-3 hover:bg-teal-50 transition-colors flex justify-between items-center"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{client.first_name} {client.last_name}</p>
                        <p className="text-xs text-slate-500">{client.email}</p>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        {client.cert_level || "No Cert"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <button 
        onClick={onOpenAddModal}
        className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 rounded-lg text-sm font-medium shadow-sm flex-shrink-0 transition-colors"
      >
        + New Client
      </button>
    </div>
  );
}