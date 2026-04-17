import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

const formatDate = (dateStr?: string) => {
  if (!dateStr) return "Unknown";
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
};

interface ClientVisitHistoryProps {
  selectedClient: any;
  clientVisits: any[];
  clientTrips: any[];
  onAddVisit: () => void;
  onEditVisit: (visitLink: any) => void;
  onRefreshVisits: () => void;
  onSelectCompanion: (client: any) => void;
  /** When provided, clicking a trip card opens it in the TripDrawer instead of navigating to /trips */
  onOpenTrip?: (tripId: string) => void;
}

export default function ClientVisitHistory({
  selectedClient,
  clientVisits,
  clientTrips,
  onAddVisit,
  onEditVisit,
  onRefreshVisits,
  onSelectCompanion,
  onOpenTrip,
}: ClientVisitHistoryProps) {
  const supabase = createClient();
  const router = useRouter();

  const [isFetchingSummary, setIsFetchingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string[] | null>(null);

  const handlePrintSummary = async () => {
    setSummaryError(null);
    setIsFetchingSummary(true);
    try {
      const resp = await fetch(`/api/client-summary?clientId=${selectedClient.id}`);
      if (resp.status === 422) {
        const body = await resp.json();
        setSummaryError(body.trips ?? ["Unknown error"]);
        return;
      }
      if (!resp.ok) {
        setSummaryError(["Could not generate summary. Please try again."]);
        return;
      }
      const html = await resp.text();
      const win = window.open("", "_blank");
      if (win) { win.document.write(html); win.document.close(); }
    } finally {
      setIsFetchingSummary(false);
    }
  };

  const handleDeleteVisit = async (visitLink: any) => {
    const visit = visitLink.visits;
    const companions = visit.visit_clients?.filter((vc: any) => vc.client_id !== selectedClient.id) || [];

    if (companions.length > 0) {
      const deleteJustMe = window.confirm(`Remove ${selectedClient.first_name} from this visit?`);
      if (!deleteJustMe) return;

      const deleteForAll = window.confirm(
        `This trip includes ${companions.length} companion(s). Do you want to delete the entire visit for EVERYONE?\n\n` +
        `(Click 'Cancel' to ONLY remove ${selectedClient.first_name} and leave the companions' visit intact).`
      );

      if (deleteForAll) {
        const { error } = await supabase.from("visits").delete().eq("id", visit.id);
        if (error) {
          alert(`Cannot delete this visit:\n\n${error.message}`);
          return;
        }
      } else {
        const { error } = await supabase.from("visit_clients").delete().eq("id", visitLink.id);
        if (error) {
          alert(`Could not remove client from visit:\n\n${error.message}`);
          return;
        }
      }
    } else {
      const confirmDelete = window.confirm(
        "Are you sure you want to delete this visit entirely?\n\n" +
        "Note: visits with recorded payments cannot be deleted."
      );
      if (!confirmDelete) return;

      const { error } = await supabase.from("visits").delete().eq("id", visit.id);
      if (error) {
        alert(`Cannot delete this visit:\n\n${error.message}`);
        return;
      }
    }

    onRefreshVisits();
  };

  const getTripsForVisit = (visit: any) => {
    if (!clientTrips || !visit.start_date || !visit.end_date) return [];
    
    const [sYear, sMonth, sDay] = visit.start_date.split('-').map(Number);
    const [eYear, eMonth, eDay] = visit.end_date.split('-').map(Number);
    
    const start = new Date(sYear, sMonth - 1, sDay, 0, 0, 0);
    const end = new Date(eYear, eMonth - 1, eDay, 23, 59, 59);

    const matchedTrips = clientTrips.filter(tc => {
      if (!tc.trips?.start_time) return false;
      const tripDate = new Date(tc.trips.start_time);
      return tripDate >= start && tripDate <= end;
    });

    return matchedTrips.sort((a, b) => new Date(a.trips.start_time).getTime() - new Date(b.trips.start_time).getTime());
  };

  return (
    <div className="w-full lg:w-6/12 bg-white rounded-xl shadow-sm border border-slate-200 h-[600px] lg:h-full overflow-hidden flex flex-col">
      <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
        <h2 className="text-lg font-semibold text-slate-800">Visit History</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrintSummary}
            disabled={isFetchingSummary}
            className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors disabled:opacity-60"
            title="Generate printable dive summary"
          >
            {isFetchingSummary ? (
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            )}
            {isFetchingSummary ? "Building..." : "Summary"}
          </button>
          <button
            onClick={onAddVisit}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors"
          >
            + Add Visit
          </button>
        </div>
      </div>

      {summaryError && (
        <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg shrink-0">
          <div className="flex justify-between items-start gap-2">
            <div>
              <p className="text-xs font-semibold text-amber-800 mb-1">Missing dive log data — cannot generate summary</p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {summaryError.map((t, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="text-amber-400">›</span> {t}
                  </li>
                ))}
              </ul>
            </div>
            <button onClick={() => setSummaryError(null)} className="text-amber-400 hover:text-amber-600 shrink-0 mt-0.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="p-6 overflow-y-auto">
        {clientVisits.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            <p>No visits recorded for this diver.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {clientVisits.map((visitLink) => {
              const visit = visitLink.visits;
              const companions = visit.visit_clients?.filter((vc: any) => vc.client_id !== selectedClient.id) || [];
              const tripsInVisit = getTripsForVisit(visit);

              return (
                <div key={visitLink.id} className="border border-slate-200 rounded-xl p-5 hover:border-teal-300 transition-colors bg-white shadow-sm flex flex-col gap-4">
                  
                  {/* Header Row */}
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-slate-800 text-lg">
                        {formatDate(visit?.start_date)} {" - "} {formatDate(visit?.end_date)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <p className="text-sm text-slate-700 font-medium">
                          {visit?.hotels?.name || "No Hotel Specified"}
                          {visitLink.room_number && (
                            <span className="text-slate-500 font-normal ml-1.5">
                              (Room {visitLink.room_number})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => window.open(`/visit-summary?clientId=${selectedClient.id}&visitId=${visit.id}`, "_blank")}
                        className="text-xs font-medium text-slate-400 hover:text-blue-600 px-2 py-1"
                        title="Print visit summary"
                      >
                        Print
                      </button>
                      <button onClick={() => onEditVisit(visitLink)} className="text-xs font-medium text-slate-400 hover:text-teal-600 px-2 py-1">
                        Edit
                      </button>
                      <button onClick={() => handleDeleteVisit(visitLink)} className="text-xs font-medium text-slate-400 hover:text-red-600 px-2 py-1">
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* CONDENSED Booked Trips Section */}
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                      Booked Trips
                      {tripsInVisit.length > 0 && (
                        <span className="bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded text-[10px]">
                          {tripsInVisit.length}
                        </span>
                      )}
                    </p>
                    {tripsInVisit.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {tripsInVisit.map((tc: any) => {
                          const trip = tc.trips;
                          const tripDate = new Date(trip.start_time);
                          const dateString = trip.start_time.split('T')[0]; // YYYY-MM-DD format for the URL

                          return (
                            <button
                              key={tc.id}
                              type="button"
                              onClick={() => {
                                if (onOpenTrip) {
                                  onOpenTrip(trip.id);
                                } else {
                                  router.push(`/trips?date=${dateString}&tripId=${trip.id}`);
                                }
                              }}
                              className="flex items-center gap-2 w-full bg-slate-50 hover:bg-teal-50 border border-slate-100 hover:border-teal-200 px-3 py-2 rounded-md transition-colors group text-sm text-left"
                            >
                              <span className="font-semibold text-slate-600 shrink-0 w-12 text-xs">
                                {tripDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                              <span className="text-slate-500 font-medium shrink-0 w-12 text-xs">
                                {tripDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="font-medium text-slate-800 truncate group-hover:text-teal-700">
                                {trip.trip_types?.name || 'Standard Trip'}
                              </span>
                              {(trip.vessels?.name || trip.divesites?.name) && (
                                <span className="text-slate-400 text-xs truncate ml-auto shrink-0 pl-2 hidden sm:inline">
                                  {[trip.vessels?.name, trip.divesites?.name].filter(Boolean).join(" • ")}
                                </span>
                              )}
                              <svg className="w-4 h-4 text-slate-300 group-hover:text-teal-500 shrink-0 ml-1 sm:ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">No trips booked for this visit yet.</p>
                    )}
                  </div>

                  {/* Companions Section */}
                  {companions.length > 0 && (
                    <div className="pt-4 border-t border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Traveling With</p>
                      <div className="flex flex-wrap gap-2">
                        {companions.map((comp: any) => (
                          <button 
                            key={comp.id}
                            onClick={() => onSelectCompanion(comp.clients)}
                            className="px-2.5 py-1 bg-white text-slate-600 hover:bg-teal-50 hover:text-teal-700 border border-slate-200 hover:border-teal-200 rounded text-xs font-medium transition-colors shadow-sm"
                            title={`Switch to ${comp.clients.first_name}'s profile`}
                          >
                            {comp.clients.first_name} {comp.clients.last_name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}