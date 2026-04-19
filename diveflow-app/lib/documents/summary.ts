import type { SupabaseClient } from '@supabase/supabase-js';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateShort(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function getTripsForVisit(visit: any, tripClients: any[]) {
  const start = new Date(visit.start_date + 'T00:00:00');
  const end   = new Date(visit.end_date   + 'T23:59:59');
  return tripClients
    .filter(tc => { if (!tc.trips?.start_time) return false; const t = new Date(tc.trips.start_time); return t >= start && t <= end; })
    .sort((a, b) => new Date(a.trips.start_time).getTime() - new Date(b.trips.start_time).getTime());
}

function buildTripHtml(tc: any, logsForTc: Map<string, any>, totalDivesRef: { v: number }, totalBottomTimeRef: { v: number }) {
  const trip  = tc.trips;
  const dives = [...(trip.trip_dives || [])].sort((a: any, b: any) => a.dive_number - b.dive_number);

  let divesHtml = '';
  if (dives.length === 0) {
    divesHtml = `<tr><td colspan="5" style="color:#94a3b8;font-style:italic;padding:2mm">No dives recorded for this trip.</td></tr>`;
  } else {
    for (const dive of dives) {
      const log = logsForTc.get(dive.id);
      totalDivesRef.v++;
      totalBottomTimeRef.v += log?.bottom_time ?? 0;
      divesHtml += `
        <tr>
          <td class="col-num">Dive ${dive.dive_number}</td>
          <td class="col-site">${dive.divesites?.name ?? '—'}</td>
          <td class="col-time">${fmtTime(dive.started_at)}</td>
          <td class="col-depth depth">${log?.max_depth != null ? `${log.max_depth} m` : '—'}</td>
          <td class="col-bt">${log?.bottom_time != null ? `${log.bottom_time} min` : '—'}</td>
        </tr>`;
    }
  }

  return `
    <div class="trip-block">
      <div class="trip-header">
        <span class="trip-type">${trip.trip_types?.name ?? 'Trip'}</span>
        <span class="trip-date">${fmtDate(trip.start_time)} &middot; ${fmtTime(trip.start_time)}</span>
      </div>
      ${trip.vessels?.name ? `<div class="trip-meta">Vessel: ${trip.vessels.name}</div>` : ''}
      <table class="dive-table">
        <colgroup>
          <col class="col-num"><col class="col-site"><col class="col-time"><col class="col-depth"><col class="col-bt">
        </colgroup>
        <thead><tr>
          <th class="col-num">#</th><th class="col-site">Site</th><th class="col-time">Time</th><th class="col-depth">Max Depth</th><th class="col-bt">Bottom Time</th>
        </tr></thead>
        <tbody>${divesHtml}</tbody>
      </table>
    </div>`;
}

export interface SummaryData {
  client: { first_name: string; last_name: string; email: string | null };
  sections: string;
  totalDives: number;
  totalBottomTime: number;
  generatedDate: string;
}

export type SummaryFetchResult =
  | { ok: true; data: SummaryData }
  | { ok: false; error: 'not_found' | 'missing_logs'; trips?: string[] };

export async function fetchSummaryData(clientId: string, supabase: SupabaseClient): Promise<SummaryFetchResult> {
  const { data: client } = await supabase
    .from('clients')
    .select('id, first_name, last_name, email')
    .eq('id', clientId)
    .single();

  if (!client) return { ok: false, error: 'not_found' };

  const { data: visitLinks } = await supabase
    .from('visit_clients')
    .select('id, room_number, visits(id, start_date, end_date, hotels(name))')
    .eq('client_id', clientId);

  const visits = (visitLinks ?? [])
    .filter((vl: any) => vl.visits)
    .sort((a: any, b: any) => new Date(a.visits.start_date).getTime() - new Date(b.visits.start_date).getTime());

  const { data: tripClients } = await supabase
    .from('trip_clients')
    .select(`id, trips(id, start_time, trip_types(name), vessels(name), trip_dives(id, dive_number, started_at, divesites(name)))`)
    .eq('client_id', clientId);

  const nowTs = new Date();
  const allTripClients: any[] = (tripClients ?? [])
    .filter((tc: any) => tc.trips && (!tc.trips.start_time || new Date(tc.trips.start_time) <= nowTs));

  const tripClientIds = allTripClients.map((tc: any) => tc.id);
  let diveLogs: any[] = [];
  if (tripClientIds.length > 0) {
    const { data: logs } = await supabase
      .from('client_dive_logs')
      .select('id, trip_dive_id, trip_client_id, max_depth, bottom_time')
      .in('trip_client_id', tripClientIds);
    diveLogs = logs ?? [];
  }

  const diveLogSet = new Set(diveLogs.map(l => `${l.trip_client_id}:${l.trip_dive_id}`));
  const missingTrips: string[] = [];
  for (const tc of allTripClients) {
    const dives: any[] = tc.trips.trip_dives ?? [];
    if (dives.length === 0) continue;
    const missingDives = dives.filter((td: any) => !diveLogSet.has(`${tc.id}:${td.id}`));
    if (missingDives.length > 0) {
      missingTrips.push(`${fmtDate(tc.trips.start_time)} — ${tc.trips.trip_types?.name ?? 'Trip'}`);
    }
  }
  if (missingTrips.length > 0) return { ok: false, error: 'missing_logs', trips: missingTrips };

  const tcLogMap = new Map<string, Map<string, any>>();
  for (const log of diveLogs) {
    if (!tcLogMap.has(log.trip_client_id)) tcLogMap.set(log.trip_client_id, new Map());
    tcLogMap.get(log.trip_client_id)!.set(log.trip_dive_id, log);
  }

  const totalDivesRef    = { v: 0 };
  const totalBottomTimeRef = { v: 0 };
  const visitedTcIds     = new Set<string>();
  let sections = '';

  for (const vl of visits) {
    const visit        = vl.visits as any;
    const tripsInVisit = getTripsForVisit(visit, allTripClients);
    if (tripsInVisit.length === 0) continue;
    tripsInVisit.forEach((tc: any) => visitedTcIds.add(tc.id));
    const tripsHtml = tripsInVisit
      .map((tc: any) => buildTripHtml(tc, tcLogMap.get(tc.id) ?? new Map(), totalDivesRef, totalBottomTimeRef))
      .join('');
    sections += `
      <div class="visit-block">
        <div class="visit-header">
          <div class="visit-title">${fmtDateShort(visit.start_date)} &rarr; ${fmtDateShort(visit.end_date)}</div>
          <div class="visit-meta">${[visit.hotels?.name, vl.room_number ? `Room ${vl.room_number}` : null].filter(Boolean).join(' &middot; ')}</div>
        </div>
        ${tripsHtml}
      </div>`;
  }

  const unvisited = allTripClients
    .filter((tc: any) => !visitedTcIds.has(tc.id))
    .sort((a: any, b: any) => new Date(a.trips.start_time).getTime() - new Date(b.trips.start_time).getTime());

  if (unvisited.length > 0) {
    const tripsHtml = unvisited
      .map((tc: any) => buildTripHtml(tc, tcLogMap.get(tc.id) ?? new Map(), totalDivesRef, totalBottomTimeRef))
      .join('');
    sections += `
      <div class="visit-block">
        <div class="visit-header local">
          <div class="visit-title">Walk-in / Local Dives</div>
          <div class="visit-meta">${unvisited.length} trip${unvisited.length !== 1 ? 's' : ''}</div>
        </div>
        ${tripsHtml}
      </div>`;
  }

  return {
    ok: true,
    data: {
      client: { first_name: (client as any).first_name, last_name: (client as any).last_name, email: (client as any).email ?? null },
      sections,
      totalDives: totalDivesRef.v,
      totalBottomTime: totalBottomTimeRef.v,
      generatedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    },
  };
}

export function buildSummaryHtml(data: SummaryData): string {
  const { client, sections, totalDives, totalBottomTime, generatedDate } = data;
  const clientFullName = `${client.first_name} ${client.last_name}`;

  const statsBar = [
    `<div class="stat-pill"><span>${totalDives}</span> Total Dives</div>`,
    totalBottomTime > 0 ? `<div class="stat-pill"><span>${totalBottomTime}</span> min Bottom Time</div>` : null,
  ].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Dive Summary &mdash; ${clientFullName}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #1e293b; background: white; }
    table.print-wrapper { width: 100%; border-collapse: collapse; }
    table.print-wrapper > thead > tr > td,
    table.print-wrapper > tfoot > tr > td { height: 14mm; padding: 0; border: 0; }
    table.print-wrapper > tbody > tr > td { padding: 0 14mm; vertical-align: top; border: 0; }
    .report-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5pt solid #0d9488; padding-bottom: 4mm; margin-bottom: 5mm; }
    .client-name { font-size: 18pt; font-weight: 900; color: #0d9488; letter-spacing: -0.02em; }
    .report-meta { text-align: right; font-size: 7.5pt; color: #64748b; line-height: 1.6; flex-shrink: 0; }
    .report-meta .label { font-size: 8.5pt; font-weight: 700; color: #475569; }
    .stats-bar { display: flex; gap: 3mm; margin-bottom: 6mm; }
    .stat-pill { background: #f0fdfa; border: 0.8pt solid #99f6e4; border-radius: 2mm; padding: 1.5mm 3.5mm; font-size: 8pt; color: #0f766e; font-weight: 600; }
    .stat-pill span { font-weight: 900; font-size: 10pt; margin-right: 1mm; }
    .visit-block { margin-bottom: 6mm; break-inside: avoid; }
    .visit-header { display: flex; justify-content: space-between; align-items: center; background: #f0fdfa; border: 0.8pt solid #0d9488; border-radius: 2mm; padding: 2.5mm 4mm; margin-bottom: 3mm; }
    .visit-header.local { background: #fefce8; border-color: #ca8a04; }
    .visit-title { font-size: 10pt; font-weight: 800; color: #0f766e; }
    .visit-header.local .visit-title { color: #92400e; }
    .visit-meta { font-size: 7.5pt; color: #64748b; text-align: right; flex-shrink: 0; }
    .trip-block { margin-left: 3mm; margin-bottom: 3.5mm; padding-left: 3mm; border-left: 2pt solid #e2e8f0; }
    .trip-header { display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; margin-bottom: 1mm; }
    .trip-type { font-size: 9pt; font-weight: 700; color: #1e293b; }
    .trip-date { font-size: 7.5pt; color: #64748b; white-space: nowrap; flex-shrink: 0; }
    .trip-meta { font-size: 7pt; color: #94a3b8; margin-bottom: 1.5mm; }
    .dive-table { width: 100%; border-collapse: collapse; font-size: 8pt; table-layout: fixed; }
    col.col-num { width: 14%; } col.col-site { width: 38%; } col.col-time { width: 13%; } col.col-depth { width: 18%; } col.col-bt { width: 17%; }
    .dive-table th { background: #f8fafc; color: #475569; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 1.5mm 2mm; text-align: left; border-bottom: 0.8pt solid #cbd5e1; overflow: hidden; }
    .dive-table td { padding: 1.5mm 2mm; border-bottom: 0.4pt solid #f1f5f9; color: #334155; vertical-align: middle; overflow: hidden; }
    .dive-table td.col-num { font-weight: 600; color: #0d9488; font-size: 7.5pt; }
    .dive-table td.depth { font-weight: 700; }
    .dive-table tr:last-child td { border-bottom: none; }
    .report-footer { margin-top: 8mm; padding-top: 3mm; border-top: 0.5pt solid #e2e8f0; font-size: 7pt; color: #94a3b8; text-align: center; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .visit-block, .trip-block { break-inside: avoid; } }
  </style>
</head>
<body>
  <table class="print-wrapper">
    <thead><tr><td></td></tr></thead>
    <tfoot><tr><td></td></tr></tfoot>
    <tbody><tr><td>
      <div class="report-header">
        <div class="client-name">${clientFullName}</div>
        <div class="report-meta">
          <div class="label">Dive History Summary</div>
          <div>Generated ${generatedDate}</div>
        </div>
      </div>
      <div class="stats-bar">${statsBar}</div>
      ${sections || `<p style="color:#94a3b8;font-size:9pt;text-align:center;padding:10mm 0">No dive history recorded for this client.</p>`}
      <div class="report-footer">DiveFlow &middot; ${generatedDate}</div>
    </td></tr></tbody>
  </table>
</body>
</html>`;
}
