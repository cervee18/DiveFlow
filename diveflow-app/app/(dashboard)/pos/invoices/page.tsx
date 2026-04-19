import { createClient } from '@/utils/supabase/server';
import InvoicesClient from './InvoicesClient';

function fmtVisit(start: string, end: string) {
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  const { data: rawInvoices } = await supabase
    .from('pos_invoices')
    .select(`
      id, created_at, visit_id, client_id,
      visits ( start_date, end_date ),
      clients ( first_name, last_name ),
      pos_invoice_items ( unit_price, quantity ),
      pos_payments (
        id, amount, payment_method, created_at,
        recorded_by_email, voided_at, void_reason, payment_group_id
      )
    `)
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(300);

  type DisplayPayment = {
    ids: string[];
    amount: number;
    methods: string[];
    createdAt: string;
    recordedByEmail: string | null;
    voided: boolean;
    voidReason: string | null;
  };

  const invoices = (rawInvoices ?? []).map((inv: any) => {
    const rawPayments: any[] = inv.pos_payments ?? [];
    const items: any[] = inv.pos_invoice_items ?? [];

    // Compute manual subtotal (only meaningful for non-visit invoices)
    const manualSubtotal = Math.round(
      items.reduce((s: number, i: any) => s + Number(i.unit_price) * i.quantity, 0) * 100
    ) / 100;

    // Collapse payments by group
    const displayPayments: DisplayPayment[] = [];
    const seenGroups = new Set<string>();
    const sorted = [...rawPayments].sort((a, b) => a.created_at < b.created_at ? -1 : 1);

    for (const p of sorted) {
      if (!p.payment_group_id) {
        displayPayments.push({
          ids: [p.id],
          amount: Math.round(Number(p.amount) * 100) / 100,
          methods: [p.payment_method],
          createdAt: p.created_at,
          recordedByEmail: p.recorded_by_email ?? null,
          voided: !!p.voided_at,
          voidReason: p.void_reason ?? null,
        });
      } else if (!seenGroups.has(p.payment_group_id)) {
        seenGroups.add(p.payment_group_id);
        const siblings = rawPayments.filter((x: any) => x.payment_group_id === p.payment_group_id);
        const allVoided = siblings.every((x: any) => !!x.voided_at);
        displayPayments.push({
          ids: siblings.map((x: any) => x.id),
          amount: Math.round(siblings.reduce((s: number, x: any) => s + Number(x.amount), 0) * 100) / 100,
          methods: [...new Set(siblings.map((x: any) => x.payment_method as string))],
          createdAt: p.created_at,
          recordedByEmail: p.recorded_by_email ?? null,
          voided: allVoided,
          voidReason: allVoided ? (p.void_reason ?? null) : null,
        });
      }
    }

    const activePayments = displayPayments.filter(p => !p.voided);
    const totalPaid = Math.round(activePayments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    const status: 'open' | 'settled' = activePayments.length > 0 ? 'settled' : 'open';

    return {
      id: inv.id as string,
      createdAt: inv.created_at as string,
      clientId: (inv.client_id ?? null) as string | null,
      clientName: inv.clients
        ? `${inv.clients.first_name} ${inv.clients.last_name}`
        : null,
      visitId: (inv.visit_id ?? null) as string | null,
      visitLabel: inv.visits
        ? fmtVisit(inv.visits.start_date, inv.visits.end_date)
        : null,
      isVisitInvoice: !!inv.visit_id,
      manualSubtotal,
      totalPaid,
      status,
      payments: displayPayments,
    };
  });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50 p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
        <p className="text-sm text-slate-500 mt-1">
          All invoices — open and settled.
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <InvoicesClient invoices={invoices} />
      </div>
    </div>
  );
}
