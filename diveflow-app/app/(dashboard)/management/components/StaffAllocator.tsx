"use client";

import { useState, useEffect } from "react";
import { promoteToStaff, searchOrganizationUsers, addClientToOrganization } from "../actions";

export default function StaffAllocator({ adminOrgId }: { adminOrgId: string }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleSelection, setRoleSelection] = useState<Record<string, string>>({});
  
  useEffect(() => {
    let active = true;
    const fetchUsers = async () => {
      // Prevent backend hits if query is only 1 or 2 characters
      const trimmed = searchQuery.trim();
      if (trimmed.length > 0 && trimmed.length < 3) {
        if (active) {
          setUsers([]);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      const data = await searchOrganizationUsers(searchQuery);
      if (active) {
        setUsers(data || []);
        setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchUsers();
    }, 400); // slightly longer debounce

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

  const handleAddClient = async (userId: string) => {
    setLoadingId(userId);
    const result = await addClientToOrganization(userId);
    setLoadingId(null);

    if (result && result.error) {
      alert("Error adding client: " + result.error);
    } else {
      const updated = await searchOrganizationUsers(searchQuery);
      setUsers(updated || []);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="border-b border-slate-200 pb-4 mb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Global Search & Staff Routing</h2>
          <p className="text-xs text-slate-500 mt-1">
            Search 3 letters globally. Elevate your own unassigned prospect, or simply import traveling Staff from other centers to your local Clients index.
          </p>
        </div>
        
        <div className="w-full md:w-80 relative">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 transition-colors"
            placeholder="Search email, first, or last name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto relative min-h-[250px]">
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
              <th className="px-4 py-3 font-medium">Global Status</th>
              <th className="px-4 py-3 font-medium text-right">Action Area</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(!isLoading && users.length === 0) && (
               <tr>
                 <td colSpan={3} className="py-12 text-center text-slate-500">
                   {searchQuery && searchQuery.length < 3 
                     ? "Keep typing to search the global directory (minimum 3 characters)."
                     : searchQuery 
                       ? "No matching users found globally." 
                       : "Search directly for specific emails or names to locate global users."}
                 </td>
               </tr>
            )}
            
            {users.map((u) => {
              const isAdmin = u.role === "admin";
              
              // Multi-Tenant Checks
              const isLocalStaff = u.organization_id === adminOrgId;
              const isEmployedElsewhere = u.organization_id && u.organization_id !== adminOrgId;
              const isLocalClient = u.is_local_client === true;
              
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
                  
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                     {isEmployedElsewhere ? (
                        <span className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 bg-orange-100 text-orange-700 rounded-sm border border-orange-200 shadow-sm">
                           Employed at Another Center
                        </span>
                     ) : isLocalStaff ? (
                        <span className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 bg-blue-100 text-blue-700 rounded-sm border border-blue-200 shadow-sm">
                           Primary Employee Here
                        </span>
                     ) : (
                        <span className="text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 bg-slate-100 text-slate-600 rounded-sm border border-slate-200 shadow-sm">
                           Globally Unassigned
                        </span>
                     )}
                     
                     {isLocalClient && (
                         <span className="text-[10px] font-medium text-teal-700 mt-1 flex items-center gap-1">
                             <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                             Indexed in Local Clients
                         </span>
                     )}
                    </div>
                  </td>
                  
                  <td className="px-4 py-3 text-right border-l border-slate-100">
                    {isAdmin ? (
                      <span className="text-xs font-semibold px-3 py-1 bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                        Administrator
                      </span>
                    ) : (
                      <div className="flex flex-col items-end justify-center gap-2">
                        {/* 1. Client Management Block */}
                        {!isLocalClient ? (
                           <button
                              onClick={() => handleAddClient(u.id)}
                              disabled={loadingId === u.id}
                              className="bg-indigo-600 hover:bg-indigo-700 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 text-white px-3 py-1 rounded-md text-xs font-semibold transition-all shadow-sm w-[150px] text-center"
                           >
                             {loadingId === u.id ? "Adding..." : "Add as Local Client"}
                           </button>
                        ) : (
                           !isLocalStaff && <span className="text-[11px] font-medium text-slate-400 italic">
                             Added to Local Clients
                           </span>
                        )}

                        {/* 2. Staff Management Block (Only if not employed elsewhere) */}
                        {!isEmployedElsewhere && (
                            <div className="flex items-center gap-2">
                               {isLocalStaff ? (
                                  <>
                                    <select
                                      className={`text-xs border ${hasChanged ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'} rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 py-1 pl-2 pr-6 transition-colors`}
                                      value={currentSelected}    
                                      onChange={(e) => setRoleSelection({ ...roleSelection, [u.id]: e.target.value })}
                                    >
                                      <option value="client">Demote to Client</option>
                                      <option value="staff_1">Staff Tier 1</option>
                                      <option value="staff_2">Staff Tier 2</option>
                                    </select>
                                    <button
                                      onClick={() => handlePromote(u.id)}
                                      disabled={!hasChanged || loadingId === u.id}
                                      className={`${
                                         hasChanged ? "bg-amber-600 hover:bg-amber-700 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                                      } focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 px-3 py-1 rounded-md text-xs font-semibold transition-all shadow-sm w-[100px] text-center`}
                                    >
                                      {loadingId === u.id ? "Saving..." : "Update Role"}
                                    </button>
                                  </>
                               ) : (
                                  <>
                                    <select
                                      className="text-xs border border-slate-300 bg-white rounded-md shadow-sm focus:ring-teal-500 focus:border-teal-500 py-1 pl-2 pr-6 transition-colors"
                                      value={roleSelection[u.id] || "staff_1"}    
                                      onChange={(e) => setRoleSelection({ ...roleSelection, [u.id]: e.target.value })}
                                    >
                                      <option value="staff_1">Hire: Staff Tier 1</option>
                                      <option value="staff_2">Hire: Staff Tier 2</option>
                                    </select>
                                    <button
                                      onClick={() => handlePromote(u.id)}
                                      disabled={loadingId === u.id}
                                      className="bg-amber-600 hover:bg-amber-700 text-white focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 px-3 py-1 rounded-md text-xs font-semibold transition-all shadow-sm w-[100px] text-center"
                                    >
                                      {loadingId === u.id ? "Saving..." : "Hire as Staff"}
                                    </button>
                                  </>
                               )}
                            </div>
                        )}
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
