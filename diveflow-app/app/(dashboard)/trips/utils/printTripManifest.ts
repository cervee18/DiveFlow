import { TANK_OPTIONS, TANK_LABELS, TankOption, TripInfo } from '../components/hooks/useTripManifest';

export interface TankSummaryEntry {
  label: string;
  count: number;
  isEanx: boolean;
}

interface PrintManifestParams {
  displayManifest: any[];
  pendingChanges: Record<string, any>;
  numberOfDives: number;
  tripInfo?: TripInfo;
  tankSummary: TankSummaryEntry[];
  nextTripMap: Record<string, string>;
}

function formatLastDive(dateString: string): string {
  const d = new Date(dateString);
  return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
}

export function printTripManifest({
  displayManifest,
  pendingChanges,
  numberOfDives,
  tripInfo,
  tankSummary,
  nextTripMap,
}: PrintManifestParams): void {
  const nd = numberOfDives ?? 1;
  const win = window.open('', '_blank');
  if (!win) return;

  const fmtTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };
  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Staff: designated captain first
  const staffSorted = tripInfo?.staff
    ? [...tripInfo.staff].sort((a, b) => (b.isCapitan ? 1 : 0) - (a.isCapitan ? 1 : 0))
    : [];
  const staffStr = staffSorted.map(s => s.initials).join('  ');

  // Table headers — each dive gets 2 sub-cols: Depth · Time
  const diveColHeaders = Array.from({ length: nd }, (_, i) =>
    `<th class="dive-h" colspan="2">Dive ${i + 1}</th>`
  ).join('');
  const diveSubHeaders = Array.from({ length: nd }, () =>
    `<th class="sub">Depth</th><th class="sub">Time</th>`
  ).join('');

  // Portrait column widths — total usable ~194mm
  const nameW  = nd >= 2 ? '27mm' : '28mm';
  const actW   = nd >= 2 ? '10mm' : '12mm';
  const notesW = nd >= 2 ? '18mm' : '27mm';

  const rows = displayManifest.map((diver, idx) => {
    const row = pendingChanges[diver.id] || {};
    const cert = diver.courses?.name || diver.clients?.certification_levels?.abbreviation || '';
    const activity = diver.activities?.name || '';
    const notes = row.notes ?? diver.notes ?? '';
    const t1 = TANK_LABELS[(row.tank1 ?? diver.tank1 ?? 'air') as TankOption];
    const t2 = nd >= 2 ? TANK_LABELS[(row.tank2 ?? diver.tank2 ?? 'air') as TankOption] : '';
    const bcd  = row.bcd    ?? diver.bcd    ?? '';
    const suit = row.wetsuit ?? diver.wetsuit ?? '';
    const fins = row.fins   ?? diver.fins   ?? '';
    const mask = row.mask   ?? diver.mask   ?? '';
    const ld = diver.clients?.last_dive_date ? formatLastDive(diver.clients.last_dive_date) : 'New';
    const nextRaw    = nextTripMap[diver.client_id] ?? '';
    const parts      = nextRaw.split('|');
    const nextStatus = parts[0];
    let nextDisplay: string;
    if (nextStatus === 'NEXT') {
      const abbr   = parts[1] ?? '';
      const timing = [parts[2], parts[3]].filter(Boolean).join(' ');
      nextDisplay  = timing ? `${timing} ${abbr}` : abbr;
    } else if ((nextStatus === '#ARR' || nextStatus === 'ARR') && parts[1]) {
      const abbr    = parts[1];
      const timing  = [parts[2], parts[3]].filter(Boolean).join(' ');
      const nextPart = timing ? `${timing} ${abbr}` : abbr;
      nextDisplay   = `${nextStatus} ${nextPart}`;
    } else {
      nextDisplay = nextRaw;
    }
    const eanxBold = (v: string) => v.toLowerCase().includes('eanx') ? ' eanx' : '';

    const diveCols = Array.from({ length: nd }, () =>
      `<td class="writein"></td><td class="writein"></td>`
    ).join('');

    return `
      <tr class="${idx % 2 === 1 ? 'alt' : ''}">
        <td class="num">${idx + 1}</td>
        <td class="name">${diver.clients?.first_name ?? ''} ${diver.clients?.last_name ?? ''}</td>
        <td class="center">${ld}</td>
        <td class="center">${cert}</td>
        <td class="center">${bcd}</td>
        <td class="center">${suit}</td>
        <td class="center">${fins}</td>
        <td class="center">${mask}</td>
        <td class="bool">${(row.regulator ?? diver.regulator) ? '✓' : ''}</td>
        <td class="bool">${(row.computer ?? diver.computer) ? '✓' : ''}</td>
        <td class="center${eanxBold(t1)}">${t1}</td>
        ${nd >= 2 ? `<td class="center${eanxBold(t2)}">${t2}</td>` : ''}
        <td class="center">${row.weights ?? diver.weights ?? ''}</td>
        <td class="bool">${(row.private ?? diver.private) ? '✓' : ''}</td>
        <td class="activity">${activity}</td>
        <td class="next ${nextStatus === '#ARR' ? 'next-arr' : nextStatus === 'LD' ? 'next-ld' : ''}">${nextDisplay}</td>
        ${diveCols}
        <td class="notes">${notes}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Manifest — ${tripInfo?.label ?? ''} ${fmtDate(tripInfo?.start_time)}</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 6pt; color: #000; }

  /* ── Header ── */
  .header {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto auto;
    column-gap: 6mm;
    row-gap: 2mm;
    margin-bottom: 2.5mm;
  }
  .header-title {
    grid-column: 1; grid-row: 1;
    display: flex; align-items: baseline; gap: 3mm; flex-wrap: wrap;
  }
  .header-title h1 {
    font-size: 10pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .header-title .label-tag {
    font-size: 8pt; font-weight: 700; white-space: nowrap;
  }
  .header-summary {
    grid-column: 2; grid-row: 1;
    text-align: right; font-size: 6.5pt; white-space: nowrap;
    display: flex; flex-direction: column; align-items: flex-end; gap: 0.8mm;
  }
  .header-summary .summary-main { font-weight: 700; }
  .header-sites {
    grid-column: 1 / -1; grid-row: 2;
    display: flex; flex-direction: row; gap: 6mm;
    border-top: 0.5pt solid #ccc; padding-top: 2mm;
  }
  .dive-block { flex: 1; display: flex; flex-direction: column; gap: 2.5mm; }
  .dive-block-title { font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 1mm; }
  .site-row { display: flex; align-items: flex-end; gap: 2mm; }
  .site-label { font-size: 7pt; font-weight: 700; width: 16mm; flex-shrink: 0; color: #333; }
  .site-line { flex: 1; border-bottom: 0.7pt solid #000; min-height: 4.5mm; }
  .header-meta {
    grid-column: 1 / -1; grid-row: 3;
    font-size: 8pt;
    display: flex; gap: 6mm; align-items: center; flex-wrap: wrap;
    border-top: 0.5pt solid #ccc; padding-top: 2mm;
  }
  .header-meta strong { font-size: 8.5pt; }
  .meta-block {
    display: inline-flex; align-items: center; gap: 2mm;
    background: #f0f4f8; border: 0.6pt solid #c0cdd8;
    border-radius: 2mm; padding: 1mm 3mm;
    font-size: 8pt;
  }

  .divider { border: none; border-top: 1pt solid #000; margin-bottom: 2mm; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.num   { width: 4mm; }
  col.name  { width: ${nameW}; }
  col.ld    { width: 8mm; }
  col.cert  { width: 9mm; }
  col.gear  { width: 6mm; }
  col.bool2 { width: 4mm; }
  col.tank  { width: 9mm; }
  col.wei   { width: 5mm; }
  col.act   { width: ${actW}; }
  col.next  { width: 7mm; }
  col.notes { width: ${notesW}; }
  col.dive  { width: 8mm; }

  th {
    background: #fff; color: #000; font-size: 5pt; font-weight: 900;
    text-transform: uppercase; text-align: center; padding: 0.8mm 0.3mm;
    border: 0.5pt solid #000; line-height: 1.2;
  }
  th.dive-h { border-top: 1pt solid #000; font-size: 5.5pt; }
  th.name-h { text-align: left; padding-left: 1mm; }

  td {
    font-size: 6pt; padding: 0.85mm 0.3mm;
    border: 0.3pt solid #999; vertical-align: middle;
    overflow: hidden;
  }
  td.num      { text-align: center; font-size: 5.5pt; }
  td.name     { font-weight: 700; font-size: 6.5pt; }
  td.center   { text-align: center; }
  td.bool     { text-align: center; font-size: 7pt; font-weight: 700; }
  td.activity { font-size: 5.5pt; }
  td.next     { text-align: center; font-size: 5.5pt; font-weight: 700; }
  td.next-arr { color: #7c3aed; }
  td.next-ld  { color: #b91c1c; }
  td.notes    { font-size: 5.5pt; font-style: italic; }
  td.writein  { background: #f5f5f5; }
  td.eanx     { font-weight: 900; }

  tr.alt td         { background: #f5f5f5; }
  tr.alt td.writein { background: #ebebeb; }

  @media print {
    td.writein, tr.alt td, tr.alt td.writein {
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
  }
</style>
</head>
<body>
  <div class="header">

    <div class="header-title">
      <h1>Dive Manifest</h1>
      ${tripInfo?.label ? `<span class="label-tag">${tripInfo.label}</span>` : ''}
    </div>

    <div class="header-summary">
      <span class="summary-main">${fmtDate(tripInfo?.start_time)}${tripInfo?.start_time ? `  ·  ${fmtTime(tripInfo.start_time)}` : ''}</span>
      <span>${tripInfo?.vessel ? `${tripInfo.vessel}  ·  ` : ''}${displayManifest.length} divers</span>
    </div>

    <div class="header-sites">
      ${Array.from({ length: nd }, (_, i) => `
        <div class="dive-block">
          <span class="dive-block-title">Dive ${i + 1}</span>
          <div class="site-row"><span class="site-label">Site:</span><span class="site-line"></span></div>
          <div class="site-row"><span class="site-label">Sightings:</span><span class="site-line"></span></div>
          <div class="site-row"><span class="site-label">Notes:</span><span class="site-line"></span></div>
        </div>`).join('')}
    </div>

    <div class="header-meta">
      ${staffStr
        ? `<span class="meta-block"><strong>Staff:</strong>&nbsp; ${staffStr}</span>`
        : ''}
      ${tankSummary.length > 0
        ? `<span class="meta-block"><strong>Tanks:</strong>&nbsp; ${tankSummary.map(t => `<span class="${t.isEanx ? 'eanx' : ''}">${t.count}×&thinsp;${t.label}</span>`).join('&ensp;')}</span>`
        : ''}
    </div>

  </div>
  <hr class="divider">

  <table>
    <colgroup>
      <col class="num"><col class="name">
      <col class="ld"><col class="cert">
      <col class="gear"><col class="gear"><col class="gear"><col class="gear">
      <col class="bool2"><col class="bool2">
      <col class="tank">${nd >= 2 ? '<col class="tank">' : ''}
      <col class="wei"><col class="bool2">
      <col class="act"><col class="next">
      ${Array.from({ length: nd }, () => '<col class="dive"><col class="dive">').join('')}
      <col class="notes">
    </colgroup>
    <thead>
      <tr>
        <th rowspan="2">#</th>
        <th class="name-h" rowspan="2">Diver Name</th>
        <th rowspan="2">LD</th>
        <th rowspan="2">Cert</th>
        <th rowspan="2">BCD</th>
        <th rowspan="2">Suit</th>
        <th rowspan="2">Fins</th>
        <th rowspan="2">Mask</th>
        <th rowspan="2">Reg</th>
        <th rowspan="2">Cmp</th>
        <th rowspan="2">T1</th>
        ${nd >= 2 ? '<th rowspan="2">T2</th>' : ''}
        <th rowspan="2">Wt</th>
        <th rowspan="2" title="Private">Prv</th>
        <th rowspan="2">Activity</th>
        <th rowspan="2" title="Next trip / status">Next</th>
        ${diveColHeaders}
        <th rowspan="2">Notes</th>
      </tr>
      <tr>${diveSubHeaders}</tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <script>setTimeout(() => { window.print(); }, 300);</script>
</body></html>`;

  win.document.write(html);
  win.document.close();
}
