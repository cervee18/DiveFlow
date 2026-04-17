import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

interface ClientFormModalProps {
  userOrgId: string | null;
  requireVisitDefault: boolean;
  onClose: () => void;
  onSuccess: (newClient: any) => void;
}

export default function ClientFormModal({ userOrgId, requireVisitDefault, onClose, onSuccess }: ClientFormModalProps) {
  const supabase = createClient();
  const [isCreating, setIsCreating] = useState(false);
  const [requiresVisit, setRequiresVisit] = useState(requireVisitDefault);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userOrgId) return;
    setIsCreating(true);

    const formData = new FormData(e.currentTarget);
    const emailValue = formData.get("email") as string;

    const newClient = {
      organization_id: userOrgId,
      first_name: formData.get("first_name"),
      last_name: formData.get("last_name"),
      email: emailValue.trim() === "" ? null : emailValue.trim(),
      phone: formData.get("phone") || null,
      requires_visit: requiresVisit,
    };

    const { data, error } = await supabase.from("clients").insert(newClient).select().single();
    setIsCreating(false);

    if (!error && data) {
      onSuccess(data);
    } else {
      console.error("Error creating client:", error);
      alert("Could not create client. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-full">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-800">Add New Diver</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleCreate} className="p-6 flex flex-col gap-5 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
              <input name="first_name" className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none" required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
              <input name="last_name" className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input name="email" type="email" className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
            <input name="phone" className="w-full px-3 py-2 border rounded-md border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none" />
          </div>

          {/* Visit requirement toggle */}
          <div className={`p-4 rounded-xl border transition-colors ${requiresVisit ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {requiresVisit ? 'Requires visit booking' : 'Local resident / walk-in'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {requiresVisit
                    ? 'Client must have an active visit before joining a trip. Removing them from a visit will remove them from all trips in that date range.'
                    : 'Client can join any trip without a visit booking. Ideal for local divers.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRequiresVisit(v => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${requiresVisit ? 'bg-blue-500' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${requiresVisit ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <div className="pt-4 mt-2 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md transition-colors">Cancel</button>
            <button type="submit" disabled={isCreating} className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-70">
              {isCreating ? "Creating..." : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
