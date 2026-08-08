"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { PERMISSION_GROUPS, STAFF_ROLES, type StaffRole, type Permission } from "@/lib/permissions";
import { getOrgRoleConfig, updateRoleDisplayName, setRolePermissions } from "../actions";

type RoleConfig = {
  role: StaffRole;
  display_name: string;
  permissions: Permission[];
};

export default function RolesConfig({ adminOrgId }: { adminOrgId: string }) {
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<StaffRole | null>(null);
  const [editingName, setEditingName] = useState<StaffRole | null>(null);
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getOrgRoleConfig(adminOrgId).then(({ data }) => {
      if (data) setRoles(data as RoleConfig[]);
      setLoading(false);
    });
  }, [adminOrgId]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const hasPermission = (role: StaffRole, key: Permission) =>
    roles.find(r => r.role === role)?.permissions.includes(key) ?? false;

  const handleTogglePermission = async (role: StaffRole, key: Permission) => {
    const current = roles.find(r => r.role === role);
    if (!current) return;

    const next = current.permissions.includes(key)
      ? current.permissions.filter(p => p !== key)
      : [...current.permissions, key];

    setRoles(prev => prev.map(r => r.role === role ? { ...r, permissions: next } : r));
    setSavingRole(role);
    await setRolePermissions(adminOrgId, role, next);
    setSavingRole(null);
  };

  const startEditName = (role: StaffRole) => {
    const current = roles.find(r => r.role === role)?.display_name ?? '';
    setNameInputs(prev => ({ ...prev, [role]: current }));
    setEditingName(role);
  };

  const commitName = async (role: StaffRole) => {
    const newName = nameInputs[role]?.trim();
    if (!newName) { setEditingName(null); return; }
    setRoles(prev => prev.map(r => r.role === role ? { ...r, display_name: newName } : r));
    setEditingName(null);
    await updateRoleDisplayName(adminOrgId, role, newName);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex justify-center">
        <svg className="animate-spin h-5 w-5 text-teal-600" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-800">Roles & Permissions</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure what each role can access. Click a role name to rename it. Admin always has full access.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-56">
                Permission
              </th>

              {/* Configurable staff columns */}
              {roles.map(r => (
                <th key={r.role} className="px-4 py-4 text-center w-32">
                  <div className="flex flex-col items-center gap-1">
                    {editingName === r.role ? (
                      <input
                        ref={nameInputRef}
                        value={nameInputs[r.role] ?? r.display_name}
                        onChange={e => setNameInputs(prev => ({ ...prev, [r.role]: e.target.value }))}
                        onBlur={() => commitName(r.role)}
                        onKeyDown={e => { if (e.key === 'Enter') commitName(r.role); if (e.key === 'Escape') setEditingName(null); }}
                        className="w-24 text-center text-xs font-semibold border border-teal-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    ) : (
                      <button
                        onClick={() => startEditName(r.role)}
                        className="group flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-teal-600 transition-colors"
                        title="Click to rename"
                      >
                        {r.display_name}
                        <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                        </svg>
                      </button>
                    )}
                    {savingRole === r.role && (
                      <span className="text-[10px] text-teal-500">saving…</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {PERMISSION_GROUPS.map((group, gi) => (
              <Fragment key={`group-${gi}`}>
                {/* Group header row */}
                <tr className="bg-slate-50">
                  <td
                    colSpan={1 + roles.length}
                    className="px-6 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400"
                  >
                    {group.label}
                  </td>
                </tr>

                {group.items.map(({ key, label }) => (
                  <tr key={key} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-sm text-slate-700">{label}</td>

                    {/* Staff cells */}
                    {roles.map(r => (
                      <td key={r.role} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={hasPermission(r.role, key)}
                          onChange={() => handleTogglePermission(r.role, key)}
                          disabled={savingRole === r.role}
                          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-50"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
