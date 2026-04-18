import { createClient } from '@/utils/supabase/server';

export default async function POSHistoryPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  // Fetch all payments for this org, joined to invoice → visit and client
  const { data: rawPayments } = await supabase
    .from('pos_payments')
    .select(`
      id,
      amount,
      payment_method,
      created_at,
      recorded_by_email,
      voided_at,
      void_reason,
      payment_group_id,
      client_id,
      clients(first_name, last_name),
      pos_invoices!inner(
        organization_id,
        visits(start_date, end_date)
      )
    `)
    .eq('pos_invoices.organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(500);

  const payments = rawPayments ?? [];

  // Group by payment_group_id; ungrouped rows are their own entry
  type DisplayPayment = {
    ids: string[];
    amount: number;
    payment_methods: string[];
    created_at: string;
    recorded_by_email: string | null;
    voided_at: string | null;
    void_reason: string | null;
    clients: Array<{ first_name: string; last_name: string }>;
    visit: { start_date: string; end_date: string } | null;
  };

  const grouped: DisplayPayment[] = [];
  const seenGroups = new Set<string>();

  for (const p of payments) {
    const invoice = (p as any).pos_invoices;
    const visit = invoice?.visits ?? null;

    if (!(p as any).payment_group_id) {
      const client = (p as any).clients;
      grouped.push({
        ids: [p.id],
        amount: Number(p.amount),
        payment_methods: [p.payment_method],
        created_at: p.created_at,
        recorded_by_email: p.recorded_by_email,
        voided_at: p.voided_at,
        void_reason: p.void_reason,
        clients: client ? [client] : [],
        visit,
      });
      continue;
    }

    const groupId = (p as any).payment_group_id;
    if (seenGroups.has(groupId)) continue;
    seenGroups.add(groupId);

    const siblings = payments.filter((x: any) => x.payment_group_id === groupId);
    const allVoided = siblings.every((x: any) => !!x.voided_at);
    const clientList = siblings
      .map((x: any) => x.clients)
      .filter(Boolean)
      .filter((c: any, idx: number, arr: any[]) =>
        arr.findIndex((o: any) => o.first_name === c.first_name && o.last_name === c.last_name) === idx
      );

    grouped.push({
      ids: siblings.map((x: any) => x.id),
      amount: siblings.reduce((s: number, x: any) => s + Number(x.amount), 0),
      payment_methods: [...new Set(siblings.map((x: any) => x.payment_method as string))],
      created_at: p.created_at,
      recorded_by_email: p.recorded_by_email,
      voided_at: allVoided ? p.voided_at : null,
      void_reason: allVoided ? p.void_reason : null,
      clients: clientList,
      visit: (siblings[0] as any).pos_invoices?.visits ?? null,
    });
  }

  const activePayments = grouped.filter(p => !p.voided_at);
  const totalCollected = activePayments.reduce((s, p) => s + p.amount, 0);

  const methodTotals = payments
    .filter((p: any) => !p.voided_at)
    .reduce<Record<string, number>>((acc, p: any) => {
      acc[p.payment_method] = (acc[p.payment_method] ?? 0) + Number(p.amount);
      return acc;
    }, {});

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">History</h1>
        <p className="text-sm text-slate-500 mt-1">All payments, most recent first.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Collected</p>
          <p className="text-2xl font-black font-mono text-emerald-600 mt-1">${totalCollected.toFixed(2)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Transactions</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{activePayments.length}</p>
        </div>
        {Object.entries(methodTotals).map(([method, total]) => (
          <div key={method} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{method}</p>
            <p className="text-2xl font-black font-mono text-slate-700 mt-1">${total.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Payment rows */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden divide-y divide-slate-100">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48">
            <p className="text-sm font-semibold text-slate-600">No payments yet.</p>
            <p className="text-xs text-slate-400 mt-1">Completed payments will appear here.</p>
          </div>
        ) : (
          grouped.map((p, idx) => {
            const isVoided = !!p.voided_at;
            const date = new Date(p.created_at);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={idx} className={`px-5 py-3.5 flex items-center justify-between gap-4 ${isVoided ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.payment_methods.map((method, i) => {
                      const siblings = payments.filter((x: any) => p.ids.includes(x.id));
                      const methodAmount = siblings
                        .filter((x: any) => x.payment_method === method && !x.voided_at)
                        .reduce((s: number, x: any) => s + Number(x.amount), 0);
                      return (
                        <span key={method} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 ${isVoided ? 'line-through' : ''}`}>
                          {method}
                          {p.payment_methods.length > 1 && (
                            <span className="font-mono font-normal">${methodAmount.toFixed(2)}</span>
                          )}
                        </span>
                      );
                    })}
                    {isVoided && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-rose-100 text-rose-500 rounded">
                        Voided
                      </span>
                    )}
                    {p.clients.length > 0 && (
                      <span className="text-xs text-slate-500">
                        {p.clients.map(c => `${c.first_name} ${c.last_name}`).join(', ')}
                      </span>
                    )}
                    {p.visit && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                        {p.visit.start_date} → {p.visit.end_date}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {dateStr} · {timeStr}
                    {p.recorded_by_email && <> · {p.recorded_by_email}</>}
                  </p>
                  {isVoided && p.void_reason && (
                    <p className="text-xs text-rose-400 italic mt-0.5">"{p.void_reason}"</p>
                  )}
                </div>
                <span className={`font-mono font-bold text-base shrink-0 ${isVoided ? 'line-through text-slate-400' : 'text-emerald-600'}`}>
                  ${p.amount.toFixed(2)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
