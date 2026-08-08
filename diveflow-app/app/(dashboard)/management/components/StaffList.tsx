"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { getOrganizationStaff, updateCaptainLicense, updateStaffRoleTier, getOrgRoleConfig } from "../actions";
import StaffAllocator from "./StaffAllocator";

type StaffMember = {
  staff_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  initials: string | null;
  captain_license: boolean;
  notes: string | null;
  cert_abbreviation: string | null;
  cert_name: string | null;
  role: string | null;
};

type RoleOption = { value: string; label: string };

const FALLBACK_ROLE_OPTIONS: RoleOption[] = [
  { value: 'admin',   label: 'Admin' },
  { value: 'staff_1', label: 'Tier 1' },
  { value: 'staff_2', label: 'Tier 2' },
  { value: 'staff_3', label: 'Tier 3' },
  { value: 'staff_4', label: 'Tier 4' },
];

export default function StaffList({ adminOrgId }: { adminOrgId: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>(FALLBACK_ROLE_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadStaff = useCallback(async () => {
    setLoading(true);
    const [{ data: staffData }, { data: roleData }] = await Promise.all([
      getOrganizationStaff(adminOrgId),
      getOrgRoleConfig(adminOrgId),
    ]);
    setStaff(staffData ?? []);
    if (roleData) {
      setRoleOptions([
        { value: 'admin', label: 'Admin' },
        ...(roleData as { role: string; display_name: string }[]).map(r => ({
          value: r.role,
          label: r.display_name,
        })),
      ]);
    }
    setLoading(false);
  }, [adminOrgId]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const handleToggleCaptain = async (member: StaffMember) => {
    const next = !member.captain_license;
    setStaff(prev => prev.map(s =>
      s.staff_id === member.staff_id ? { ...s, captain_license: next } : s
    ));
    setSavingId(member.staff_id);
    const result = await updateCaptainLicense(member.staff_id, next);
    setSavingId(null);
    if (result.error) {
      setErrors(prev => ({ ...prev, [member.staff_id]: result.error! }));
      setStaff(prev => prev.map(s =>
        s.staff_id === member.staff_id ? { ...s, captain_license: !next } : s
      ));
    }
  };

  const handleRoleChange = async (member: StaffMember, newRole: string) => {
    if (!member.user_id) return;
    setStaff(prev => prev.map(s =>
      s.staff_id === member.staff_id ? { ...s, role: newRole } : s
    ));
    setSavingId(member.staff_id);
    const result = await updateStaffRoleTier(member.user_id, newRole);
    setSavingId(null);
    if (result.error) {
      setErrors(prev => ({ ...prev, [member.staff_id]: result.error! }));
      setStaff(prev => prev.map(s =>
        s.staff_id === member.staff_id ? { ...s, role: member.role } : s
      ));
    }
  };

  const clearError = (staffId: string) =>
    setErrors(prev => { const e = { ...prev }; delete e[staffId]; return e; });

  return (
    <div className="space-y-4">

      {/* Staff table card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Staff Members</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {loading ? "Loading…" : `${staff.length} member${staff.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={() => setShowAddPanel(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              showAddPanel
                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                : "bg-teal-600 text-white hover:bg-teal-700"
            }`}
          >
            {showAddPanel ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Staff Member
              </>
            )}
          </button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 flex justify-center">
              <svg className="animate-spin h-6 w-6 text-teal-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : staff.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              No staff members yet. Use Add Staff Member to hire someone.
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Initials</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Cert</th>
                  <th className="px-4 py-3 font-medium text-center">Captain</th>
                  <th className="px-4 py-3 font-medium">Role Tier</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map(member => (
                  <Fragment key={member.staff_id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      {/* Name */}
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {member.first_name} {member.last_name}
                      </td>

                      {/* Initials */}
                      <td className="px-4 py-3">
                        {member.initials ? (
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 text-xs font-bold">
                            {member.initials}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                        {member.email}
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {member.phone ?? <span className="text-slate-300">—</span>}
                      </td>

                      {/* Cert */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {member.cert_abbreviation ? (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-200"
                            title={member.cert_name ?? undefined}
                          >
                            {member.cert_abbreviation}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Captain toggle */}
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleCaptain(member)}
                          disabled={savingId === member.staff_id}
                          title={member.captain_license ? "Remove captain license" : "Grant captain license"}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 disabled:opacity-50 ${
                            member.captain_license ? "bg-teal-600" : "bg-slate-200"
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            member.captain_license ? "translate-x-4" : "translate-x-0.5"
                          }`} />
                        </button>
                      </td>

                      {/* Role tier */}
                      <td className="px-4 py-3">
                        {member.user_id ? (
                          <select
                            value={member.role ?? "staff_1"}
                            onChange={e => handleRoleChange(member, e.target.value)}
                            disabled={savingId === member.staff_id}
                            className="text-xs border border-slate-300 rounded-md bg-white shadow-sm focus:ring-teal-500 focus:border-teal-500 py-1 pl-2 pr-6 disabled:opacity-50"
                          >
                            {roleOptions.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No account</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="px-4 py-3 text-slate-500 max-w-[180px]">
                        {member.notes ? (
                          <span className="truncate block text-xs" title={member.notes}>
                            {member.notes}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>

                    {errors[member.staff_id] && (
                      <tr className="bg-rose-50">
                        <td colSpan={8} className="px-4 py-2 text-xs text-rose-700">
                          <div className="flex items-center gap-2">
                            <span>{errors[member.staff_id]}</span>
                            <button
                              onClick={() => clearError(member.staff_id)}
                              className="ml-auto text-rose-400 hover:text-rose-600"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Staff panel */}
      {showAddPanel && (
        <StaffAllocator
          adminOrgId={adminOrgId}
          onHire={() => { loadStaff(); setShowAddPanel(false); }}
        />
      )}

    </div>
  );
}
