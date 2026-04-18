import type { SupabaseClient } from '@supabase/supabase-js';

function fmtMoney(n: number) {
  return '$' + n.toFixed(2);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export interface ReceiptData {
  orgName: string;
  clientName: string | null;
  clientEmail: string | null;
  issuedAt: string;
  visitContext: string | null;
  allItems: { name: string; price: number; clientName: string | null }[];
  methodTotals: Record<string, number>;
  subtotal: number;
  totalPaid: number;
  balance: number;
}

export async function fetchReceiptData(invoiceId: string, supabase: SupabaseClient): Promise<ReceiptData | null> {
  const { data: invoice } = await supabase
    .from('pos_invoices')
    .select('id, visit_id, client_id, organization_id, status')
    .eq('id', invoiceId)
    .single();

  if (!invoice) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', invoice.organization_id)
    .single();

  const { data: client } = invoice.client_id
    ? await supabase.from('clients').select('first_name, last_name, email').eq('id', invoice.client_id).single()
    : { data: null };

  let visitContext: string | null = null;
  let automatedItems: { clientName: string; name: string; price: number; waived: boolean }[] = [];

  if (invoice.visit_id) {
    const { data: visit } = await supabase
      .from('visits')
      .select('start_date, end_date')
      .eq('id', invoice.visit_id)
      .single();

    if (visit) visitContext = `${fmtDateShort(visit.start_date)} – ${fmtDateShort(visit.end_date)}`;

    const { data: payload } = await supabase.rpc('calculate_visit_invoice_payload', { p_visit_id: invoice.visit_id });
    if (payload?.clients) {
      for (const [, member] of Object.entries(payload.clients as Record<string, any>)) {
        for (const item of (member as any).automated_items ?? []) {
          automatedItems.push({ clientName: (member as any).client_name, name: item.name, price: Number(item.price), waived: !!item.waived });
        }
      }
    }
  }

  const { data: rawItems } = await supabase
    .from('pos_invoice_items')
    .select('quantity, unit_price, pos_products(name), client_id, clients(first_name, last_name)')
    .eq('invoice_id', invoiceId);

  const manualItems = (rawItems ?? []).map((i: any) => ({
    name: i.pos_products?.name ?? 'Item',
    price: Number(i.unit_price) * Number(i.quantity),
    clientName: i.clients ? `${i.clients.first_name} ${i.clients.last_name}` : null,
  }));

  const { data: rawPayments } = await supabase
    .from('pos_payments')
    .select('amount, payment_method, created_at')
    .eq('invoice_id', invoiceId)
    .is('voided_at', null)
    .order('created_at');

  const payments = (rawPayments ?? []).map((p: any) => ({
    method: p.payment_method as string,
    amount: Number(p.amount),
    date: p.created_at as string,
  }));

  const methodTotals: Record<string, number> = {};
  for (const p of payments) {
    methodTotals[p.method] = (methodTotals[p.method] ?? 0) + p.amount;
  }

  const allItems = [
    ...automatedItems.filter(i => !i.waived).map(i => ({ name: i.name, price: i.price, clientName: i.clientName })),
    ...manualItems,
  ];

  const subtotal = allItems.reduce((s, i) => s + i.price, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = Math.round((subtotal - totalPaid) * 100) / 100;
  const issuedAt = payments[0]?.date ? fmtDate(payments[0].date) : fmtDate(new Date().toISOString());

  return {
    orgName: org?.name ?? 'DiveFlow',
    clientName: client ? `${(client as any).first_name} ${(client as any).last_name}` : null,
    clientEmail: (client as any)?.email ?? null,
    issuedAt,
    visitContext,
    allItems,
    methodTotals,
    subtotal,
    totalPaid,
    balance,
  };
}

export function buildReceiptHtml(data: ReceiptData): string {
  const { orgName, clientName, issuedAt, visitContext, allItems, methodTotals, subtotal, totalPaid, balance } = data;

  const multipleClients = new Set(allItems.map(i => i.clientName).filter(Boolean)).size > 1;

  const itemRowsHtml = allItems.map(item => `
    <tr>
      <td class="item-name">${item.name}${multipleClients && item.clientName ? ` <span class="item-client">(${item.clientName})</span>` : ''}</td>
      <td class="item-price">${fmtMoney(item.price)}</td>
    </tr>`).join('');

  const paymentRowsHtml = Object.entries(methodTotals).map(([method, amount]) => `
    <tr>
      <td class="pay-method">${method}</td>
      <td class="pay-amount">${fmtMoney(amount as number)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt – ${orgName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: 80mm auto; margin: 0; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 11px; color: #1e293b; background: #fff;
      width: 80mm; padding: 6mm 5mm 8mm;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .header { text-align: center; margin-bottom: 5mm; }
    .org-name { font-size: 15px; font-weight: 800; letter-spacing: -0.3px; }
    .receipt-label { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-top: 1.5mm; }
    .meta { font-size: 9.5px; color: #475569; margin-top: 1mm; }
    .divider { border: none; border-top: 1px dashed #cbd5e1; margin: 3.5mm 0; }
    .divider-solid { border: none; border-top: 1px solid #e2e8f0; margin: 3mm 0; }
    .section-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; margin-bottom: 2mm; }
    table { width: 100%; border-collapse: collapse; }
    .item-name { color: #334155; padding: 1mm 0; }
    .item-client { font-size: 9px; color: #94a3b8; }
    .item-price { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding: 1mm 0; color: #334155; }
    .totals-row td { padding: 1mm 0; }
    .totals-label { color: #64748b; }
    .totals-value { text-align: right; font-variant-numeric: tabular-nums; color: #334155; }
    .totals-bold td { font-weight: 700; font-size: 12px; }
    .totals-balance td { color: ${balance > 0 ? '#dc2626' : '#059669'}; font-weight: 700; }
    .pay-method { color: #334155; padding: 1mm 0; }
    .pay-amount { text-align: right; font-variant-numeric: tabular-nums; color: #334155; padding: 1mm 0; }
    .footer { text-align: center; margin-top: 5mm; font-size: 9px; color: #94a3b8; }
    @media print { body { padding: 6mm 5mm 8mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="org-name">${orgName}</div>
    <div class="receipt-label">Receipt</div>
    <div class="meta">${issuedAt}${visitContext ? ' &middot; ' + visitContext : ''}${clientName ? '<br>' + clientName : ''}</div>
  </div>
  <hr class="divider">
  <div class="section-label">Charges</div>
  <table><tbody>${itemRowsHtml}</tbody></table>
  <hr class="divider-solid">
  <table><tbody>
    <tr class="totals-row">
      <td class="totals-label">Subtotal</td>
      <td class="totals-value">${fmtMoney(subtotal)}</td>
    </tr>
  </tbody></table>
  <hr class="divider">
  <div class="section-label">Payment</div>
  <table><tbody>${paymentRowsHtml}</tbody></table>
  <hr class="divider-solid">
  <table><tbody>
    <tr class="totals-row totals-bold">
      <td class="totals-label">Total paid</td>
      <td class="totals-value">${fmtMoney(totalPaid)}</td>
    </tr>
    ${balance !== 0 ? `
    <tr class="totals-row totals-balance">
      <td>${balance > 0 ? 'Balance due' : 'Change'}</td>
      <td style="text-align:right">${fmtMoney(Math.abs(balance))}</td>
    </tr>` : ''}
  </tbody></table>
  <hr class="divider">
  <div class="footer">Thank you!</div>
</body>
</html>`;
}
