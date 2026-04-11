'use client';

import { useState, useTransition, useMemo, useRef, useEffect } from 'react';
import { searchClients, getClientTabData, payClientFullTab, voidPayment, deleteParkedCartFromTabs } from './actions';
import { SectionLabel, EmptyState, fmtMoney } from './components/helpers';
import { type Client, type VisitSelection } from './components/types';
import ClientSearchPanel from './components/ClientSearchPanel';
import VisitCard from './components/VisitCard';
import ParkedSaleCard from './components/ParkedSaleCard';
import PaymentHistorySection from './components/PaymentHistorySection';
import PayModal from './components/PayModal';
import VoidModal from './components/VoidModal';

export default function TabsClient({ initialClient }: { initialClient?: { id: string; name: string } | null }) {
  const [isPending, startTransition] = useTransition();

  // Client search
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Tab data
  const [tabData, setTabData] = useState<any | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Per-visit selection map
  const [visitsSelection, setVisitsSelection] = useState<Record<string, VisitSelection>>({});

  // Payment modal
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payMethod, setPayMethod] = useState('Visa');
  const [payAmount, setPayAmount] = useState('');
  const [payError, setPayError] = useState('');

  // Void modal
  const [voidTarget, setVoidTarget] = useState<{ id: string; amount: number; method: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');

  // Auto-select client from URL param
  useEffect(() => {
    if (initialClient) selectClient(initialClient);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (val: string) => {
    setSearchText(val);
    setIsDropdownOpen(true);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      if (val.length < 2) { setSearchResults([]); return; }
      const res = await searchClients(val);
      if (res.data) setSearchResults(res.data);
    }, 300);
  };

  const loadClientData = async (c: Client) => {
    setTabData(null);
    setVisitsSelection({});
    setIsLoadingData(true);
    const res = await getClientTabData(c.id);
    setIsLoadingData(false);
    if (res.data) setTabData(res.data);
  };

  const selectClient = (c: Client) => {
    setSelectedClient(c);
    setSearchText(c.name);
    setSearchResults([]);
    setIsDropdownOpen(false);
    startTransition(() => loadClientData(c));
  };

  const clearClient = () => {
    setSelectedClient(null);
    setSearchText('');
    setSearchResults([]);
    setTabData(null);
    setVisitsSelection({});
  };

  const refreshTab = async () => {
    if (!selectedClient) return;
    setIsLoadingData(true);
    const res = await getClientTabData(selectedClient.id);
    setIsLoadingData(false);
    setVisitsSelection({});
    if (res.data) setTabData(res.data);
  };

  // Derived data
  const visits: any[]      = tabData?.visits ?? [];
  const parkedCarts: any[] = tabData?.parkedCarts ?? [];
  const payments: any[]    = tabData?.payments ?? [];

  const visitSelectedBalance = useMemo(
    () => Object.values(visitsSelection).reduce((s, v) => s + Math.max(0, v.balance), 0),
    [visitsSelection]
  );

  const parkedTotal = useMemo(
    () => parkedCarts.reduce((s: number, cart: any) => {
      const items: any[] = cart.pos_parked_cart_items ?? [];
      return s + items.reduce((si: number, i: any) => si + Number(i.unit_price) * i.quantity, 0);
    }, 0),
    [parkedCarts]
  );

  const grandTotal = visitSelectedBalance + parkedTotal;

  const totalOutstanding = useMemo(() => {
    const visitOwed = visits.reduce((s: number, v: any) => s + Math.max(0, v.payload?.grand_totals?.master_balance ?? 0), 0);
    return Math.round((visitOwed + parkedTotal) * 100) / 100;
  }, [visits, parkedTotal]);

  // Payment actions
  const openPayModal = () => {
    setPayAmount(grandTotal.toFixed(2));
    setPayMethod('Visa');
    setPayError('');
    setIsPayModalOpen(true);
  };

  const confirmPayment = () => {
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) { setPayError('Enter a valid amount.'); return; }
    const visitSources = Object.values(visitsSelection).filter(v => v.balance > 0 && v.members.length > 0);
    const parkedCartIds = parkedCarts.map((c: any) => c.id);
    startTransition(async () => {
      const res = await payClientFullTab(selectedClient!.id, visitSources, parkedCartIds, parkedTotal, amount, payMethod);
      if (res.error) { setPayError(res.error); return; }
      setIsPayModalOpen(false);
      await refreshTab();
    });
  };

  const openVoidModal = (p: any) => {
    setVoidTarget({ id: p.id, amount: p.amount, method: p.payment_method });
    setVoidReason('');
    setVoidError('');
  };

  const confirmVoid = () => {
    if (!voidTarget) return;
    startTransition(async () => {
      const res = await voidPayment(voidTarget.id, voidReason || 'Voided by staff');
      if (res.error) { setVoidError(res.error); return; }
      setVoidTarget(null);
      await refreshTab();
    });
  };

  const onDeleteParkedCart = async (cartId: string) => {
    await deleteParkedCartFromTabs(cartId);
    setTabData((prev: any) =>
      prev ? { ...prev, parkedCarts: prev.parkedCarts.filter((c: any) => c.id !== cartId) } : prev
    );
  };

  return (
    <div className="flex gap-6 h-full overflow-hidden">

      {/* ── Left: client picker ── */}
      <ClientSearchPanel
        searchText={searchText}
        searchResults={searchResults}
        isDropdownOpen={isDropdownOpen}
        selectedClient={selectedClient}
        tabData={tabData}
        visits={visits}
        parkedCarts={parkedCarts}
        parkedTotal={parkedTotal}
        totalOutstanding={totalOutstanding}
        onSearchChange={onSearchChange}
        onDropdownOpen={() => setIsDropdownOpen(true)}
        onDropdownClose={() => setIsDropdownOpen(false)}
        onSelectClient={selectClient}
        onClearClient={clearClient}
      />

      {/* ── Right: data + sticky footer ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto space-y-6 pr-1 pb-2">

          {!selectedClient && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 border border-slate-200">
                <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-slate-700">Search for a client</h3>
              <p className="text-sm text-slate-400 mt-1">Type a name or email in the search box to get started.</p>
            </div>
          )}

          {selectedClient && isLoadingData && (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-3 text-slate-400">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm font-semibold">Loading tab data…</span>
              </div>
            </div>
          )}

          {selectedClient && tabData && !isLoadingData && (
            <>
              <section>
                <SectionLabel>Visit Charges</SectionLabel>
                {visits.length === 0 ? (
                  <EmptyState text="No visits found for this client." />
                ) : (
                  <div className="space-y-3">
                    {visits.map(v => (
                      <VisitCard
                        key={v.visitId}
                        visit={v}
                        selectedClientId={selectedClient.id}
                        onSelectionChange={sel => setVisitsSelection(prev => ({ ...prev, [sel.visitId]: sel }))}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <SectionLabel>Parked Sales</SectionLabel>
                {parkedCarts.length === 0 ? (
                  <EmptyState text="No parked sales for this client." />
                ) : (
                  <div className="space-y-2">
                    {parkedCarts.map((cart: any) => (
                      <ParkedSaleCard key={cart.id} cart={cart} onDelete={onDeleteParkedCart} />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <SectionLabel>History</SectionLabel>
                {payments.length === 0 ? (
                  <EmptyState text="No payments recorded yet." />
                ) : (
                  <PaymentHistorySection payments={payments} onVoid={openVoidModal} />
                )}
              </section>
            </>
          )}
        </div>

        {/* Sticky payment footer */}
        {selectedClient && tabData && grandTotal > 0 && (
          <div className="shrink-0 mt-3 bg-white border border-slate-200 rounded-xl shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.08)] px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400">
                {visitSelectedBalance > 0 && parkedTotal > 0
                  ? 'Visit charges + parked sales'
                  : visitSelectedBalance > 0
                  ? `${Object.values(visitsSelection).filter(v => v.balance > 0).length} visit${Object.values(visitsSelection).filter(v => v.balance > 0).length !== 1 ? 's' : ''} selected`
                  : `${parkedCarts.length} parked sale${parkedCarts.length !== 1 ? 's' : ''}`}
              </p>
              <p className="text-2xl font-black font-mono text-slate-800">{fmtMoney(grandTotal)}</p>
            </div>
            <button
              onClick={openPayModal}
              disabled={isPending}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-md disabled:opacity-50 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
              Pay
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {voidTarget && (
        <VoidModal
          target={voidTarget}
          reason={voidReason}
          error={voidError}
          isPending={isPending}
          onReasonChange={setVoidReason}
          onConfirm={confirmVoid}
          onClose={() => setVoidTarget(null)}
        />
      )}

      {isPayModalOpen && (
        <PayModal
          clientName={selectedClient?.name ?? ''}
          visitSelectedBalance={visitSelectedBalance}
          parkedTotal={parkedTotal}
          grandTotal={grandTotal}
          payMethod={payMethod}
          payAmount={payAmount}
          payError={payError}
          isPending={isPending}
          onMethodChange={setPayMethod}
          onAmountChange={setPayAmount}
          onConfirm={confirmPayment}
          onClose={() => setIsPayModalOpen(false)}
        />
      )}
    </div>
  );
}
