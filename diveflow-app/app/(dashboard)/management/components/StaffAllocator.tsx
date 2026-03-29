"use client";

import { useState, useEffect } from "react";
import { promoteToStaff, searchOrganizationUsers } from "../actions";

export default function StaffAllocator() {
  const [users, setUsers] = useState<any[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleSelection, setRoleSelection] = useState<Record<string, string>>({});
  
  useEffect(() => {
    let active = true;
    const fetchUsers = async () => {
      setIsLoading(true);
      const data = await searchOrganizationUsers(searchQuery);
      if (active) {
        setUsers(data || []);
        setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchUsers();
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handlePromote = async (userId: string) => {
    const targetRole = roleSelection[userId] || "staff_1"; // Default tier
    setLoadingId(userId);
    
    const result = await promoteToStaff(userId, targetRole);
    setLoadingId(null);
    
    if (result && result.error) {
      alert("Error promoting user: " + result.error);
    } else {
      // Refresh the list directly
      const updated = await searchOrganizationUsers(searchQuery);
      setUsers(updated || []);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="border-b border-slate-200 pb-4 mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Staff Allocation</h2>
          <p className="text-xs text-slate-500 mt-1">
            Search for registered clients and elevate them to official Staff members.
          </p>
        </div>
        
        <div className="w-full md:w-72 relative">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 transition-colors"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto relative min-h-[150px]">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
            <svg className="animate-spin h-6 w-6 text-teal-600" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}

        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="text-xs text-slate-500 bg-slate-50/70 border-y border-slate-200 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 font-medium">Auth Identity</th>
              <th className="px-4 py-3 font-medium">Joined Date</th>
              <th className="px-4 py-3 font-medium text-right">Action Area</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(!isLoading && users.length === 0) && (
               <tr>
                 <td colSpan={3} className="py-8 text-center text-slate-500">
                   {searchQuery ? "No matching clients found." : "Start typing to search available clients."}
                 </td>
               </tr>
            )}
            
            {users.map((u) => {
              const isAdmin = u.role === "admin";
              const currentSelected = roleSelection[u.id] || u.role;
              const hasChanged = currentSelected !== u.role;

              return (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">
                      {u.first_name || "Missing"} {u.last_name || "Name"}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{u.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isAdmin ? (
                      <span className="text-xs font-semibold px-3 py-1 bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                        Administrator
                      </span>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <select
                          title="Assign appropriate Role"
                          className={`text-xs border ${hasChanged ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'} rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 py-1.5 pl-2 pr-6 transition-colors`}
                          value={currentSelected}
                          onChange={(e) => setRoleSelection({ ...roleSelection, [u.id]: e.target.value })}
                        >
                          <option value="client">Client (No Access)</option>
                          <option value="staff_1">Staff Tier 1</option>
                          <option value="staff_2">Staff Tier 2</option>
                        </select>
                        <button
                          onClick={() => handlePromote(u.id)}
                          disabled={!hasChanged || loadingId === u.id}
                          className={`${
                             hasChanged ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                          } focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-sm flex items-center gap-1`}
                        >
                          {loadingId === u.id ? "Saving..." : "Update Role"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
