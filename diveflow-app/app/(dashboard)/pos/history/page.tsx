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

  const { data: transactions } = await supabase
    .from('pos_transactions')
    .select(`
      id,
      created_at,
      pos_invoices(
        id,
        status,
        visits(start_date, end_date)
      ),
      pos_invoice_items(
        quantity,
        unit_price,
        pos_products(name)
      ),
      pos_payments(
        amount,
        payment_method,
        notes,
        recorded_by_email,
        clients(first_name, last_name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = transactions ?? [];

  const totalCollected = rows.reduce((sum, t) => {
    const payments = (t.pos_payments as any[]) ?? [];
    return sum + payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  }, 0);

  const methodTotals = rows.reduce<Record<string, number>>((acc, t) => {
    const payments = (t.pos_payments as any[]) ?? [];
    payments.forEach((p: any) => {
      acc[p.payment_method] = (acc[p.payment_method] ?? 0) + Number(p.amount);
    });
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">History</h1>
        <p className="text-sm text-slate-500 mt-1">All checkout transactions, most recent first.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Collected</p>
          <p className="text-2xl font-black font-mono text-emerald-600 mt-1">${totalCollected.toFixed(2)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Transactions</p>
          <p className="text-2xl font-black text-slate-800 mt-1">{rows.length}</p>
        </div>
        {Object.entries(methodTotals).map(([method, total]) => (
          <div key={method} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{method}</p>
            <p className="text-2xl font-black font-mono text-slate-700 mt-1">${total.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Transactions */}
      <div className="space-y-4">
        {rows.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col items-center justify-center h-48">
            <p className="text-sm font-semibold text-slate-600">No transactions yet.</p>
            <p className="text-xs text-slate-400 mt-1">Completed checkouts will appear here.</p>
          </div>
        ) : (
          rows.map((t) => {
            const invoice = t.pos_invoices as any;
            const visit = invoice?.visits as any;
            const items = (t.pos_invoice_items as any[]) ?? [];
            const payments = (t.pos_payments as any[]) ?? [];

            const itemsTotal = items.reduce((s: number, i: any) => s + (Number(i.unit_price) * i.quantity), 0);
            const paidTotal = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);

            const date = new Date(t.created_at);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={t.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Transaction Header */}
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="font-semibold text-slate-800 text-sm">{dateStr}</span>
                      <span className="text-xs text-slate-400 ml-2">{timeStr}</span>
                    </div>
                    {visit ? (
                      <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded font-medium">
                        Visit: {visit.start_date} → {visit.end_date}
                      </span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-400 px-2 py-1 rounded italic">Walk-in</span>
                    )}
                  </div>
                  <span className="font-mono font-black text-emerald-600 text-lg">${paidTotal.toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-2 divide-x divide-slate-100">
                  {/* Items */}
                  <div className="p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Items Sold</p>
                    {items.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No items recorded</p>
                    ) : (
                      <div className="space-y-1.5">
                        {items.map((item: any, i: number) => (
                          <div key={i} className="flex justify-between items-center text-sm">
                            <span className="text-slate-700">
                              {item.quantity > 1 && (
                                <span className="text-xs font-bold text-slate-400 mr-1">{item.quantity}×</span>
                              )}
                              {item.pos_products?.name ?? '—'}
                            </span>
                            <span className="font-mono text-slate-800 font-medium">
                              ${(Number(item.unit_price) * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center text-xs text-slate-400 pt-1.5 border-t border-slate-100 mt-1.5">
                          <span>Items subtotal</span>
                          <span className="font-mono">${itemsTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Payments */}
                  <div className="p-4">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Payment</p>
                    {payments.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No payment recorded</p>
                    ) : (
                      <div className="space-y-3">
                        {payments.map((p: any, i: number) => {
                          const client = p.clients as any;
                          const staffName = p.recorded_by_email ?? null;
                          return (
                            <div key={i} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    {p.payment_method}
                                  </span>
                                  {client ? (
                                    <span className="text-xs text-slate-500">{client.first_name} {client.last_name}</span>
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">Unassigned</span>
                                  )}
                                </div>
                                <span className="font-mono font-bold text-emerald-600">${Number(p.amount).toFixed(2)}</span>
                              </div>
                              {staffName && (
                                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                  </svg>
                                  Recorded by {staffName}
                                </div>
                              )}
                              {p.notes && (
                                <p className="text-xs text-slate-400 italic">{p.notes}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
