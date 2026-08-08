"use client";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

interface SimilarClient {
  id: string;
  client_number: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  cert_number: string | null;
  cert_level: string | null;
  user_id: string | null;
  similarity_score: number;
  match_reasons: string[];
}

interface Props {
  primaryClient: any;
  candidates: SimilarClient[];
  certLevels: any[];
  onClose: () => void;
  onMergeComplete: (survivingId: string, removedId: string) => void;
}

const MATCH_REASON_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  cert_number: "Cert #",
};

const FIELDS: { key: string; label: string }[] = [
  { key: "full_name",           label: "Full Name" },
  { key: "email",               label: "Email" },
  { key: "phone",               label: "Phone" },
  { key: "cert_level",          label: "Cert Level" },
  { key: "cert_organization",   label: "Cert Org" },
  { key: "cert_number",         label: "Cert Number" },
  { key: "nitrox_cert_number",  label: "Nitrox Cert #" },
  { key: "last_dive_date",      label: "Last Dive" },
  { key: "address",             label: "Address" },
  { key: "emergency_contact",   label: "Emergency Contact" },
  { key: "notes",               label: "Notes" },
];

function getDisplay(key: string, client: any, certLevels: any[]): string {
  if (!client) return "—";
  switch (key) {
    case "full_name":
      return `${client.first_name} ${client.last_name}`;
    case "cert_level":
      if (!client.cert_level) return "—";
      return certLevels.find((c: any) => c.id === client.cert_level)?.name || String(client.cert_level);
    case "address":
      return [client.address_street, client.address_city, client.address_zip, client.address_country].filter(Boolean).join(", ") || "—";
    case "emergency_contact":
      return [client.emergency_contact_name, client.emergency_contact_phone].filter(Boolean).join(" / ") || "—";
    case "notes": {
      const n = client.notes;
      if (!n) return "—";
      return n.length > 80 ? n.slice(0, 80) + "…" : n;
    }
    default:
      return client[key] != null ? String(client[key]) : "—";
  }
}

function getMerged(key: string, primary: any, duplicate: any, certLevels: any[]): string {
  switch (key) {
    case "full_name":
      return `${primary.first_name} ${primary.last_name}`;
    case "last_dive_date": {
      const pd = primary.last_dive_date;
      const dd = duplicate.last_dive_date;
      if (!pd && !dd) return "—";
      if (!pd) return dd;
      if (!dd) return pd;
      return pd > dd ? pd : dd;
    }
    case "notes": {
      const pn = primary.notes;
      const dn = duplicate.notes;
      if (!pn && !dn) return "—";
      if (!pn) return dn.length > 80 ? dn.slice(0, 80) + "…" : dn;
      if (!dn) return pn.length > 80 ? pn.slice(0, 80) + "…" : pn;
      const combined = pn + "\n---\n" + dn;
      return combined.length > 80 ? combined.slice(0, 80) + "…" : combined;
    }
    case "address": {
      const pv = [primary.address_street, primary.address_city, primary.address_zip, primary.address_country].filter(Boolean).join(", ");
      const dv = [duplicate.address_street, duplicate.address_city, duplicate.address_zip, duplicate.address_country].filter(Boolean).join(", ");
      return pv || dv || "—";
    }
    case "emergency_contact": {
      const pv = [primary.emergency_contact_name, primary.emergency_contact_phone].filter(Boolean).join(" / ");
      const dv = [duplicate.emergency_contact_name, duplicate.emergency_contact_phone].filter(Boolean).join(" / ");
      return pv || dv || "—";
    }
    case "cert_level": {
      const val = primary.cert_level ?? duplicate.cert_level;
      if (!val) return "—";
      return certLevels.find((c: any) => c.id === val)?.name || String(val);
    }
    default: {
      const val = primary[key] ?? duplicate[key] ?? null;
      return val != null ? String(val) : "—";
    }
  }
}

// True if the merged result would draw from the duplicate (so we can flag it visually)
function comesFromDuplicate(key: string, primary: any, duplicate: any): boolean {
  switch (key) {
    case "full_name":
      return false;
    case "last_dive_date":
      if (!primary.last_dive_date && duplicate.last_dive_date) return true;
      if (primary.last_dive_date && duplicate.last_dive_date && duplicate.last_dive_date > primary.last_dive_date) return true;
      return false;
    case "notes":
      return !primary.notes && !!duplicate.notes;
    case "address":
      return ![primary.address_street, primary.address_city].some(Boolean) && [duplicate.address_street, duplicate.address_city].some(Boolean);
    case "emergency_contact":
      return !primary.emergency_contact_name && !!duplicate.emergency_contact_name;
    default:
      return primary[key] == null && duplicate[key] != null;
  }
}

export default function MergeDuplicatesModal({ primaryClient, candidates, certLevels, onClose, onMergeComplete }: Props) {
  const supabase = createClient();
  const [selected, setSelected] = useState<SimilarClient | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Default: candidate with Passport becomes primary; user can override with swap button
  const defaultFlip = !!(selected?.user_id && !primaryClient.user_id);
  const flipped = defaultFlip !== isFlipped; // XOR: default can be overridden
  const effectivePrimary   = flipped ? selected   : primaryClient;
  const effectiveDuplicate = flipped ? primaryClient : selected;

  // Warn if user is trying to make the Passport client the duplicate
  const passportWarning = selected?.user_id && !flipped && !primaryClient.user_id
    ? null // auto-flipped case (already handled)
    : primaryClient.user_id && flipped
      ? "The current client has a Passport account — making them the duplicate will unlink it."
      : null;

  const handleConfirm = async () => {
    if (!selected) return;
    setIsMerging(true);
    setMergeError(null);

    const { data, error } = await supabase.rpc("merge_clients", {
      p_primary_id:   effectivePrimary!.id,
      p_duplicate_id: effectiveDuplicate!.id,
    });

    if (error || data?.error) {
      setMergeError(data?.error || error?.message || "Merge failed. Please try again.");
      setIsMerging(false);
      return;
    }

    onMergeComplete(effectivePrimary!.id, effectiveDuplicate!.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {selected ? "Review Merge" : "Possible Duplicates"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {selected
                ? `Merging into: ${effectivePrimary!.first_name} ${effectivePrimary!.last_name} #${effectivePrimary!.client_number}`
                : `${candidates.length} client${candidates.length !== 1 ? "s" : ""} may be the same person as ${primaryClient.first_name} ${primaryClient.last_name}`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {!selected ? (
            /* ── Step 1: Candidate list ── */
            <div className="p-5 flex flex-col gap-3">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelected(c); setIsFlipped(false); setMergeError(null); }}
                  className="w-full text-left p-4 rounded-lg border border-slate-200 hover:border-teal-400 hover:bg-teal-50/30 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {c.first_name} {c.last_name}
                        <span className="ml-2 text-xs font-normal text-slate-400">#{c.client_number}</span>
                        {c.user_id && (
                          <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">Passport</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"}
                        {c.cert_number ? ` · Cert: ${c.cert_number}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {c.match_reasons?.map((r) => (
                          <span key={r} className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                            {MATCH_REASON_LABELS[r] || r} match
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-md px-2 py-1">
                        {Math.round(c.similarity_score * 100)}% similar
                      </div>
                      <span className="text-xs text-teal-600 group-hover:underline mt-2 block">Review →</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* ── Step 2: Field-by-field merge review ── */
            <div className="p-5">
              {/* Who's primary + swap control */}
              <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 mb-0.5">Primary (kept)</p>
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {effectivePrimary!.first_name} {effectivePrimary!.last_name}
                    <span className="ml-1.5 text-xs font-normal text-slate-400">#{effectivePrimary!.client_number}</span>
                    {effectivePrimary!.user_id && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">Passport</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setIsFlipped(f => !f); setMergeError(null); }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 text-slate-600 hover:bg-white hover:border-teal-400 hover:text-teal-700 transition-all"
                  title="Swap who is primary"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4M4 17h12m0 0l-4-4m4 4l-4 4" />
                  </svg>
                  Swap
                </button>
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-500 mb-0.5">Removed</p>
                  <p className="text-sm font-semibold text-slate-500 truncate">
                    {effectiveDuplicate!.first_name} {effectiveDuplicate!.last_name}
                    <span className="ml-1.5 text-xs font-normal text-slate-400">#{effectiveDuplicate!.client_number}</span>
                  </p>
                </div>
              </div>

              {passportWarning && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  ⚠ {passportWarning}
                </div>
              )}

              {/* Column headers */}
              <div className="grid grid-cols-3 gap-2 mb-1.5 px-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Primary <span className="text-slate-400 font-normal">(kept)</span></p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-500">Candidate <span className="text-slate-400 font-normal">(removed)</span></p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-700">Will become</p>
              </div>

              {/* Field rows */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {FIELDS.map(({ key, label }, idx) => {
                  const primVal   = getDisplay(key, effectivePrimary,   certLevels);
                  const candVal   = getDisplay(key, effectiveDuplicate, certLevels);
                  const merged    = getMerged(key, effectivePrimary!, effectiveDuplicate!, certLevels);
                  const fromDup   = comesFromDuplicate(key, effectivePrimary!, effectiveDuplicate!);
                  const differs   = primVal !== candVal && candVal !== "—";

                  return (
                    <div
                      key={key}
                      className={`grid grid-cols-3 gap-2 px-3 py-2.5 text-xs border-b border-slate-100 last:border-b-0 ${differs ? "bg-amber-50/40" : idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                    >
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">{label}</p>
                        <p className="text-slate-700 break-words leading-relaxed">{primVal}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">&nbsp;</p>
                        <p className={`break-words leading-relaxed ${differs && candVal !== "—" ? "text-slate-700" : "text-slate-400"}`}>{candVal}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">&nbsp;</p>
                        <p className={`font-medium break-words leading-relaxed ${fromDup ? "text-teal-700" : "text-slate-800"}`}>
                          {merged}
                          {fromDup && merged !== "—" && (
                            <span className="ml-1 text-[9px] font-normal text-teal-500 whitespace-nowrap">← candidate</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {mergeError && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {mergeError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between shrink-0">
          {selected ? (
            <>
              <button
                onClick={() => { setSelected(null); setIsFlipped(false); setMergeError(null); }}
                disabled={isMerging}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                ← Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={isMerging}
                className="px-5 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-70 flex items-center gap-2"
              >
                {isMerging ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Merging…
                  </>
                ) : "Confirm Merge"}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="ml-auto px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
