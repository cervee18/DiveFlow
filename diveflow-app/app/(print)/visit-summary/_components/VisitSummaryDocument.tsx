"use client";

import { Fragment } from "react";

export interface DiveLog {
  dive_number: number | null;
  started_at: string | null;
  divesite_name: string | null;
  max_depth: number | null;
  bottom_time: number | null; // minutes
}

export interface VisitSummaryTrip {
  id: string;
  start_time: string;
  trip_type_name: string | null;
  vessel_name: string | null;
  divesite_name: string | null;
  number_of_dives: number | null;
  dive_logs: DiveLog[];
}

export interface VisitSummaryData {
  org: {
    name: string;
    email: string | null;
    phone: string | null;
    timezone: string;
    unit_system: string; // "metric" | "imperial"
  };
  client: {
    first_name: string;
    last_name: string;
    cert_level_abbr: string | null;
    cert_number: string | null;
  };
  visit: {
    start_date: string; // YYYY-MM-DD
    end_date: string;   // YYYY-MM-DD
    hotel_name: string | null;
    room_number: string | null;
  };
  trips: VisitSummaryTrip[];
  generatedAt: string; // ISO string
}

function formatVisitDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTripDay(isoStr: string, timezone: string): string {
  return new Date(isoStr).toLocaleDateString("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDepth(depth: number, unitSystem: string): string {
  if (unitSystem === "imperial") {
    return `${Math.round(depth * 3.28084)} ft`;
  }
  return `${depth % 1 === 0 ? depth.toFixed(0) : depth.toFixed(1)} m`;
}

function formatTripTime(isoStr: string, timezone: string): string {
  return new Date(isoStr).toLocaleTimeString("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VisitSummaryDocument({ data }: { data: VisitSummaryData }) {
  const { org, client, visit, trips, generatedAt } = data;

  const totalDives = trips.reduce((sum, t) => sum + (t.number_of_dives ?? 1), 0);

  const certLine = [client.cert_level_abbr, client.cert_number ? `Cert #\u00a0${client.cert_number}` : null]
    .filter(Boolean)
    .join(" · ");

  const hotelLine = [visit.hotel_name, visit.room_number ? `Room ${visit.room_number}` : null]
    .filter(Boolean)
    .join(" · ");

  const orgContact = [org.email, org.phone].filter(Boolean).join(" · ");

  const generatedDate = new Date(generatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="max-w-2xl mx-auto p-10 text-slate-800 font-sans text-sm">

      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{org.name}</h1>
          {orgContact && (
            <p className="text-xs text-slate-500 mt-0.5">{orgContact}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Visit Summary</p>
        </div>
      </div>

      {/* Client + Visit Info */}
      <div className="mb-6">
        <p className="text-lg font-semibold text-slate-900">
          {client.first_name} {client.last_name}
        </p>
        {certLine && (
          <p className="text-xs text-slate-500 mt-0.5">{certLine}</p>
        )}

        <div className="mt-3 flex flex-col gap-1">
          <p className="text-sm font-medium text-slate-700">
            {formatVisitDate(visit.start_date)}
            <span className="text-slate-400 mx-2">–</span>
            {formatVisitDate(visit.end_date)}
          </p>
          {hotelLine && (
            <p className="text-xs text-slate-500">{hotelLine}</p>
          )}
        </div>
      </div>

      {/* Trips Table */}
      <div className="border-t border-slate-200 pt-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
          Scheduled Trips
        </p>

        {trips.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No trips booked for this visit.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Date</th>
                <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-16">Time</th>
                <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Trip Type</th>
                <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vessel</th>
                <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide w-14">Dives</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <Fragment key={trip.id}>
                  <tr className={trip.dive_logs.length > 0 ? "border-b-0" : "border-b border-slate-100 last:border-0"}>
                    <td className="py-2.5 pr-4 font-medium text-slate-700">
                      {formatTripDay(trip.start_time, org.timezone)}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600 tabular-nums">
                      {formatTripTime(trip.start_time, org.timezone)}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-800">
                      {trip.trip_type_name ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      {trip.vessel_name ?? "—"}
                    </td>
                    <td className="py-2.5 text-right text-slate-600 tabular-nums">
                      {trip.number_of_dives ?? 1}
                    </td>
                  </tr>
                  {trip.dive_logs.map((log, i) => {
                    const depthTime = [
                      log.max_depth != null ? formatDepth(log.max_depth, org.unit_system) : null,
                      log.bottom_time != null ? `${log.bottom_time} min` : null,
                    ].filter(Boolean).join(" · ");

                    return (
                      <tr key={`log-${i}`} className="border-b border-slate-100 last:border-0">
                        {/* Col 1 – dive label (indented under date) */}
                        <td className="pb-2.5 pt-0 pl-3 pr-4 text-xs text-slate-500">
                          <span className="text-slate-300 mr-1">└</span>
                          <span className="font-medium text-slate-600">Dive {log.dive_number ?? i + 1}</span>
                        </td>
                        {/* Col 2 – time slot (empty) */}
                        <td />
                        {/* Col 3 – depth · bottom time */}
                        <td className="pb-2.5 pt-0 pr-4 text-xs text-slate-500 tabular-nums">
                          {depthTime || "—"}
                        </td>
                        {/* Col 4 – dive site */}
                        <td className="pb-2.5 pt-0 pr-4 text-xs text-slate-500">
                          {log.divesite_name ?? ""}
                        </td>
                        {/* Col 5 – empty */}
                        <td />
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
        <span>
          {trips.length} {trips.length === 1 ? "trip" : "trips"} · {totalDives} {totalDives === 1 ? "dive" : "dives"} total
        </span>
        <span>Generated {generatedDate}</span>
      </div>

    </div>
  );
}
