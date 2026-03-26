"use client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PickupClient {
  name: string;
  room_number: string | null;
}

export interface PickupHotelGroup {
  hotel_name: string | null; // null → "No Hotel"
  clients: PickupClient[];
}

export interface PickupSlot {
  start_time: string;        // ISO timestamp
  trip_type_name: string | null;
  groups: PickupHotelGroup[];
}

export interface PickupListData {
  org: {
    name: string;
    timezone: string;
  };
  date: string;              // YYYY-MM-DD
  slots: PickupSlot[];
  generatedAt: string;       // ISO
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPickupDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(isoStr: string, timezone: string): string {
  return new Date(isoStr).toLocaleTimeString("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatGeneratedDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PickupListDocument({ data }: { data: PickupListData }) {
  const { org, date, slots, generatedAt } = data;

  const totalPickups = slots.reduce(
    (sum, s) => sum + s.groups.reduce((gs, g) => gs + g.clients.length, 0),
    0,
  );

  return (
    <div className="max-w-2xl mx-auto p-10 text-slate-800 font-sans text-sm">

      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-8">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">{org.name}</h1>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Pick-Up List</p>
          <p className="text-sm font-medium text-slate-700 mt-0.5">{formatPickupDate(date)}</p>
        </div>
      </div>

      {/* Slots */}
      {slots.length === 0 ? (
        <p className="text-slate-400 italic text-sm">No pick-ups scheduled for this day.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {slots.map((slot, si) => {
            const slotTotal = slot.groups.reduce((s, g) => s + g.clients.length, 0);
            return (
              <div key={si}>

                {/* Trip time header */}
                <div className="flex items-baseline gap-3 pb-2 border-b-2 border-slate-700 mb-4">
                  <span className="text-base font-bold tabular-nums text-slate-900">
                    {formatTime(slot.start_time, org.timezone)}
                  </span>
                  {slot.trip_type_name && (
                    <span className="text-sm text-slate-500">{slot.trip_type_name}</span>
                  )}
                  <span className="ml-auto text-xs text-slate-400 tabular-nums">
                    {slotTotal} {slotTotal === 1 ? "guest" : "guests"}
                  </span>
                </div>

                {/* Hotel groups */}
                <div className="flex flex-col gap-5">
                  {slot.groups.map((group, gi) => (
                    <div key={gi} style={{ breakInside: "avoid" }}>
                      {/* Hotel name */}
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          {group.hotel_name ?? "No Hotel"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {group.clients.length} {group.clients.length === 1 ? "guest" : "guests"}
                        </p>
                      </div>

                      {/* Client rows */}
                      {group.clients.map((client, ci) => (
                        <div
                          key={ci}
                          className="flex justify-between items-baseline py-1.5 border-b border-slate-100 last:border-0"
                        >
                          <span className="font-medium text-slate-800">{client.name}</span>
                          {client.room_number ? (
                            <span className="text-xs text-slate-400 tabular-nums shrink-0 ml-4">
                              Rm.&nbsp;{client.room_number}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300 shrink-0 ml-4">—</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
        <span>
          {totalPickups} {totalPickups === 1 ? "pick-up" : "pick-ups"} &middot;{" "}
          {slots.length} {slots.length === 1 ? "trip" : "trips"}
        </span>
        <span>Generated {formatGeneratedDate(generatedAt)}</span>
      </div>

    </div>
  );
}
