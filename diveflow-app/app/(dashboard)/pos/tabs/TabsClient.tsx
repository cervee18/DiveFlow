'use client';

import { useState, useTransition, useMemo, useRef, useEffect } from 'react';
import { searchClients, getClientTabData, payClientFullTab, voidPayment, recordDeposit, voidDeposit, toggleItemWaiver, deleteInvoiceItem } from './actions';
import { addManualItem } from '../sell/actions';
import { SectionLabel, EmptyState, fmtMoney } from './components/helpers';
import { type Client, type VisitSelection } from './components/types';
import ClientSearchPanel from './components/ClientSearchPanel';
import VisitCard from './components/VisitCard';
import StandaloneChargesCard from './components/StandaloneChargesCard';
import TransactionHistoryCard, { type HistoryEntry, type PaymentRow } from './components/TransactionHistoryCard';
import PayModal from './components/PayModal';
import VoidModal from './components/VoidModal';
import DepositModal from './components/DepositModal';

export default function TabsClient({ initialClient, products }: { initialClient?: { id: string; name: string } | null; products: any[] }) {
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
  const [payError, setPayError] = useState('');

  // Void modal (payments)
  const [voidTarget, setVoidTarget] = useState<{ ids: string[]; amount: number; method: string } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState('');

  // Deposit modal
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositMethod, setDepositMethod] = useState('Cash');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [depositError, setDepositError] = useState('');

  // Void deposit modal
  const [voidDepositTarget, setVoidDepositTarget] = useState<{ id: string; amount: number; method: string } | null>(null);
  const [voidDepositReason, setVoidDepositReason] = useState('');
  const [voidDepositError, setVoidDepositError] = useState('');

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
    setSelectedStandaloneIds(new Set());
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

  const refreshTab = async (silent = false) => {
    if (!selectedClient) return;
    if (!silent) setIsLoadingData(true);
    const res = await getClientTabData(selectedClient.id);
    if (!silent) setIsLoadingData(false);
    if (!silent) setVisitsSelection({});
    if (res.data) setTabData(res.data);
  };

  // Standalone invoice selection: invoiceId → selected boolean
  // Auto-select all unpaid invoices whenever the data (re)loads
  const [selectedStandaloneIds, setSelectedStandaloneIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const unpaid = (tabData?.standaloneInvoices ?? [])
      .filter((inv: any) => inv.balance > 0)
      .map((inv: any) => inv.invoiceId);
    setSelectedStandaloneIds(new Set(unpaid));
  }, [tabData?.standaloneInvoices]);

  // Derived data
  const visits: any[]              = tabData?.visits ?? [];
  const standaloneInvoices: any[]  = tabData?.standaloneInvoices ?? [];
  const history: HistoryEntry[]    = tabData?.history ?? [];
  const deposits: any[]            = tabData?.deposits ?? [];
  const creditBalance: number      = tabData?.creditBalance ?? 0;

  const visitSelectedBalance = useMemo(
    () => Object.values(visitsSelection).reduce((s, v) => s + Math.max(0, v.balance), 0),
    [visitsSelection]
  );

  const standaloneSelectedBalance = useMemo(
    () => standaloneInvoices
      .filter((inv: any) => selectedStandaloneIds.has(inv.invoiceId))
      .reduce((s: number, inv: any) => s + Math.max(0, inv.balance), 0),
    [standaloneInvoices, selectedStandaloneIds]
  );

  const grandTotal = visitSelectedBalance + standaloneSelectedBalance;

  const totalOutstanding = useMemo(() => {
    const visitOwed = visits.reduce((s: number, v: any) => s + Math.max(0, v.payload?.grand_totals?.master_balance ?? 0), 0);
    const standaloneOwed = standaloneInvoices.reduce((s: number, inv: any) => s + Math.max(0, inv.balance), 0);
    return Math.round((visitOwed + standaloneOwed) * 100) / 100;
  }, [visits, standaloneInvoices]);

  // Payment actions
  const openPayModal = () => {
    setPayError('');
    setIsPayModalOpen(true);
  };

  const toggleStandalone = (invoiceId: string, _balance: number) => {
    setSelectedStandaloneIds(prev => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId); else next.add(invoiceId);
      return next;
    });
  };

  const confirmPayment = (splits: Array<{ amount: number; method: string }>) => {
    setPayError('');
    const visitSources = Object.values(visitsSelection).filter(v => v.balance > 0 && v.members.length > 0);

    // Treat selected standalone invoices as single-member visit sources
    const standaloneSources = standaloneInvoices
      .filter((inv: any) => selectedStandaloneIds.has(inv.invoiceId) && inv.balance > 0)
      .map((inv: any) => ({
        visitId: inv.invoiceId,
        invoiceId: inv.invoiceId,
        balance: inv.balance,
        members: [{ clientId: selectedClient!.id, balanceDue: inv.balance }],
      }));

    startTransition(async () => {
      const res = await payClientFullTab(
        selectedClient!.id,
        [...visitSources, ...standaloneSources],
        [],
        0,
        splits,
      );
      if (res.error) { setPayError(res.error); return; }
      setIsPayModalOpen(false);
      setSelectedStandaloneIds(new Set());
      await refreshTab();
    });
  };

  const openVoidModal = (row: PaymentRow) => {
    setVoidTarget({ ids: row.ids, amount: row.amount, method: row.method });
    setVoidReason('');
    setVoidError('');
  };

  const confirmVoid = () => {
    if (!voidTarget) return;
    startTransition(async () => {
      const res = await voidPayment(voidTarget.ids, voidReason || 'Voided by staff');
      if (res.error) { setVoidError(res.error); return; }
      setVoidTarget(null);
      await refreshTab();
    });
  };

  const openDepositModal = () => {
    setDepositAmount('');
    setDepositMethod('Cash');
    setDepositNote('');
    setDepositError('');
    setIsDepositModalOpen(true);
  };

  const confirmDeposit = () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) { setDepositError('Enter a valid amount.'); return; }
    startTransition(async () => {
      const res = await recordDeposit(selectedClient!.id, amount, depositMethod, depositNote);
      if (res.error) { setDepositError(res.error); return; }
      setIsDepositModalOpen(false);
      await refreshTab();
    });
  };

  const openVoidDepositModal = (dep: any) => {
    setVoidDepositTarget({ id: dep.id, amount: dep.amount, method: dep.method });
    setVoidDepositReason('');
    setVoidDepositError('');
  };

  const confirmVoidDeposit = () => {
    if (!voidDepositTarget) return;
    startTransition(async () => {
      const res = await voidDeposit(voidDepositTarget.id, voidDepositReason || 'Voided by staff');
      if (res.error) { setVoidDepositError(res.error); return; }
      setVoidDepositTarget(null);
      await refreshTab();
    });
  };

  const handleAddItem = async (visitId: string, invoiceId: string | null, clientId: string, productId: string, price: number, qty: number) => {
    await addManualItem(visitId, invoiceId, productId, clientId, price, qty);
    await refreshTab(true);
  };

  const handleWaiveItem = async (visitId: string, clientId: string, itemKey: string, waived: boolean) => {
    await toggleItemWaiver(visitId, clientId, itemKey, waived);
    await refreshTab(true);
  };

  const handleDeleteItem = async (invoiceItemId: string) => {
    await deleteInvoiceItem(invoiceItemId);
    await refreshTab(true);
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
              {/* Credit balance banner + Add Deposit */}
              <div className="flex items-center justify-between gap-3">
                {creditBalance > 0 ? (
                  <div className="flex-1 flex items-center gap-2.5 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5">
                    <div className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                    <div>
                      <span className="text-sm font-bold text-teal-700">Credit on account · </span>
                      <span className="text-sm font-mono font-black text-teal-700">{fmtMoney(creditBalance)}</span>
                      <span className="text-xs text-teal-500 ml-1">available</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1" />
                )}
                <button
                  onClick={openDepositModal}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-teal-700 border border-teal-200 bg-teal-50 hover:bg-teal-100 rounded-xl transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Deposit
                </button>
              </div>

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
                        products={products}
                        onSelectionChange={sel => setVisitsSelection(prev => ({ ...prev, [sel.visitId]: sel }))}
                        onAddItem={handleAddItem}
                        onWaiveItem={handleWaiveItem}
                        onDeleteItem={handleDeleteItem}
                      />
                    ))}
                  </div>
                )}
              </section>

              {standaloneInvoices.length > 0 && (
                <section>
                  <SectionLabel>Direct Charges</SectionLabel>
                  <div className="space-y-3">
                    {standaloneInvoices.map((inv: any) => (
                      <StandaloneChargesCard
                        key={inv.invoiceId}
                        invoice={inv}
                        isSelected={selectedStandaloneIds.has(inv.invoiceId)}
                        onToggle={toggleStandalone}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <SectionLabel>History</SectionLabel>
                {history.length === 0 && deposits.length === 0 ? (
                  <EmptyState text="No transactions recorded yet." />
                ) : (
                  <div className="space-y-2">
                    {/* Deposits */}
                    {deposits.map((dep: any) => (
                      <div
                        key={dep.id}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs ${
                          dep.voided
                            ? 'bg-slate-50 border-slate-100 opacity-50'
                            : 'bg-teal-50 border-teal-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dep.voided ? 'bg-slate-300' : 'bg-teal-400'}`} />
                          <div className="min-w-0">
                            <p className={`font-semibold ${dep.voided ? 'line-through text-slate-400' : 'text-teal-800'}`}>
                              Deposit · {dep.method}
                              {dep.note && <span className="font-normal text-slate-500"> — {dep.note}</span>}
                            </p>
                            <p className="text-slate-400 mt-0.5">
                              {new Date(dep.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {' · '}
                              {new Date(dep.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              {dep.recordedByEmail && ` · by ${dep.recordedByEmail.includes('@') ? dep.recordedByEmail.split('@')[0] : dep.recordedByEmail}`}
                              {dep.voided && dep.voidReason && ` · ${dep.voidReason}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`font-mono font-bold ${dep.voided ? 'line-through text-slate-400' : 'text-teal-700'}`}>
                            +{fmtMoney(dep.amount)}
                          </span>
                          {!dep.voided && (
                            <button
                              type="button"
                              onClick={() => openVoidDepositModal(dep)}
                              className="text-xs text-slate-300 hover:text-rose-500 transition-colors px-1 py-0.5 rounded hover:bg-rose-50"
                            >
                              Void
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Invoice payments */}
                    {history.map((entry, idx) => (
                      <TransactionHistoryCard
                        key={idx}
                        entry={entry}
                        onVoid={openVoidModal}
                      />
                    ))}
                  </div>
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
                {visitSelectedBalance > 0 && standaloneSelectedBalance > 0
                  ? 'Visit charges + direct charges'
                  : visitSelectedBalance > 0
                  ? `${Object.values(visitsSelection).filter(v => v.balance > 0).length} visit${Object.values(visitsSelection).filter(v => v.balance > 0).length !== 1 ? 's' : ''} selected`
                  : `${selectedStandaloneIds.size} direct charge${selectedStandaloneIds.size !== 1 ? 's' : ''} selected`}
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
          standaloneSelectedBalance={standaloneSelectedBalance}
          grandTotal={grandTotal}
          creditBalance={creditBalance}
          isPending={isPending}
          onConfirm={confirmPayment}
          onClose={() => setIsPayModalOpen(false)}
        />
      )}

      {isDepositModalOpen && (
        <DepositModal
          clientName={selectedClient?.name ?? ''}
          method={depositMethod}
          amount={depositAmount}
          note={depositNote}
          error={depositError}
          isPending={isPending}
          onMethodChange={setDepositMethod}
          onAmountChange={setDepositAmount}
          onNoteChange={setDepositNote}
          onConfirm={confirmDeposit}
          onClose={() => setIsDepositModalOpen(false)}
        />
      )}

      {voidDepositTarget && (
        <VoidModal
          target={{ ids: [voidDepositTarget.id], amount: voidDepositTarget.amount, method: voidDepositTarget.method }}
          reason={voidDepositReason}
          error={voidDepositError}
          isPending={isPending}
          onReasonChange={setVoidDepositReason}
          onConfirm={confirmVoidDeposit}
          onClose={() => setVoidDepositTarget(null)}
        />
      )}
    </div>
  );
}
