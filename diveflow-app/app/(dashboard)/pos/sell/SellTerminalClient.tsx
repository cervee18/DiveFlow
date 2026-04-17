'use client';

import { useState, useTransition, useMemo, useEffect } from 'react';
import {
  checkoutSession,
  parkSale,
  getParkedCarts,
  deleteParkedCart,
  getClientVisitsForTerminal,
  addCartToClientTab,
} from './actions';
import type { CartItem, Client, ClientVisit } from './components/types';
import ProductCatalog from './components/ProductCatalog';
import CartHeader from './components/CartHeader';
import CartItems from './components/CartItems';
import ParkedPanel from './components/ParkedPanel';
import SellPaymentModal from './components/SellPaymentModal';
import VisitSelectorModal from './components/VisitSelectorModal';

interface SellTerminalClientProps {
  manualProducts: any[];
  categories: any[];
  clients: Client[];
}

/** Return today in YYYY-MM-DD (local) */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Find the visit that contains today, or the most-recent past visit, or null */
function findDefaultVisit(visits: ClientVisit[]): string | null {
  const today = todayStr();
  const current = visits.find(v => v.startDate <= today && today <= v.endDate);
  if (current) return current.id;
  const past = visits.filter(v => v.endDate < today);
  if (past.length > 0) return past[0].id; // already sorted desc
  return null;
}

export default function SellTerminalClient({ manualProducts, categories, clients }: SellTerminalClientProps) {
  const [isPending, startTransition] = useTransition();

  // Catalog filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Client attribution
  const [clientSearchText, setClientSearchText] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Client visits (loaded when client is selected)
  const [clientVisits, setClientVisits] = useState<ClientVisit[]>([]);

  // Cart
  const [sessionItems, setSessionItems] = useState<CartItem[]>([]);

  // Payment modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Visa');

  // Parked carts
  const [parkedCarts, setParkedCarts] = useState<any[]>([]);
  const [isParkedPanelOpen, setIsParkedPanelOpen] = useState(false);

  // Visit selector modal (for "Add to Tab")
  const [isVisitSelectorOpen, setIsVisitSelectorOpen] = useState(false);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);

  // Add-to-tab error
  const [addToTabError, setAddToTabError] = useState('');

  const refreshParkedCarts = async () => {
    const res = await getParkedCarts();
    if (res.data) setParkedCarts(res.data);
  };

  useEffect(() => { refreshParkedCarts(); }, []);

  // Load client visits whenever client changes
  useEffect(() => {
    if (!selectedClient) { setClientVisits([]); return; }
    getClientVisitsForTerminal(selectedClient.id).then(res => {
      const visits = res.data ?? [];
      setClientVisits(visits);
      setSelectedVisitId(findDefaultVisit(visits));
    });
  }, [selectedClient]);

  // Derived
  const filteredProducts = useMemo(() => manualProducts.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCat = selectedCategoryId ? p.category_id === selectedCategoryId : true;
    return matchSearch && matchCat;
  }), [manualProducts, searchQuery, selectedCategoryId]);

  const matchingClients = useMemo(() => {
    if (!clientSearchText || selectedClient) return [];
    return clients.filter(c => c.name.toLowerCase().includes(clientSearchText.toLowerCase())).slice(0, 10);
  }, [clientSearchText, clients, selectedClient]);

  const cartTotal = useMemo(() => sessionItems.reduce((s, i) => s + i.price * i.qty, 0), [sessionItems]);

  // Handlers
  const resetTerminal = () => {
    setSelectedClient(null);
    setClientSearchText('');
    setSessionItems([]);
    setIsPaymentModalOpen(false);
    setIsSearchFocused(false);
    setClientVisits([]);
    setSelectedVisitId(null);
    setAddToTabError('');
  };

  const onSelectClient = (c: Client) => {
    setSelectedClient(c);
    setClientSearchText(c.name);
    setIsSearchFocused(false);
  };

  const onClearClient = () => {
    setSelectedClient(null);
    setClientSearchText('');
    setClientVisits([]);
    setSelectedVisitId(null);
  };

  const onAddItem = (product: any) => {
    setSessionItems(prev => {
      const exists = prev.find(i => i.id === product.id);
      if (exists) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: product.id, name: product.name, price: Number(product.price), priceStr: Number(product.price).toFixed(2), qty: 1 }];
    });
  };

  const onUpdateQty = (i: number, qty: number) => {
    if (qty < 1) return;
    setSessionItems(prev => prev.map((item, idx) => idx === i ? { ...item, qty } : item));
  };

  const onUpdatePrice = (i: number, raw: string) => {
    setSessionItems(prev => prev.map((item, idx) => idx === i ? { ...item, priceStr: raw, price: parseFloat(raw) || 0 } : item));
  };

  const onUpdatePriceBlur = (i: number) => {
    setSessionItems(prev => prev.map((item, idx) => idx === i ? { ...item, priceStr: item.price.toFixed(2) } : item));
  };

  const onRemoveItem = (i: number) => {
    setSessionItems(prev => prev.filter((_, idx) => idx !== i));
  };

  const onParkSale = () => {
    if (sessionItems.length === 0) return;
    startTransition(async () => {
      const label = selectedClient?.name ?? 'Walk-in Tab';
      const res = await parkSale(label, selectedClient?.id ?? null, null, sessionItems);
      if (!res.error) {
        await refreshParkedCarts();
        resetTerminal();
      }
    });
  };

  const onOpenAddToTab = () => {
    setAddToTabError('');
    // If client has no visits, skip the picker and go straight
    if (clientVisits.length === 0) {
      confirmAddToTab(null);
    } else {
      setIsVisitSelectorOpen(true);
    }
  };

  const confirmAddToTab = (visitId: string | null) => {
    if (sessionItems.length === 0) return;
    startTransition(async () => {
      const res = await addCartToClientTab(selectedClient!.id, visitId, sessionItems);
      if (res.error) { setAddToTabError(res.error); return; }
      setIsVisitSelectorOpen(false);
      resetTerminal();
    });
  };

  const onPay = () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    startTransition(async () => {
      await checkoutSession(null, null, selectedClient?.id ?? null, sessionItems, amount, paymentMethod);
      resetTerminal();
    });
  };

  const onResumeCart = (cart: any) => {
    const items = (cart.pos_parked_cart_items as any[]).map((i: any) => ({
      id: i.pos_products.id,
      name: i.pos_products.name,
      price: Number(i.unit_price),
      priceStr: Number(i.unit_price).toFixed(2),
      qty: i.quantity,
    }));
    setSessionItems(items);
    if (cart.client_id) {
      const match = clients.find(c => c.id === cart.client_id);
      if (match) onSelectClient(match);
    }
    setParkedCarts(prev => prev.filter(c => c.id !== cart.id));
    deleteParkedCart(cart.id);
    setIsParkedPanelOpen(false);
  };

  const onDeleteParkedCart = async (cartId: string) => {
    setParkedCarts(prev => prev.filter(c => c.id !== cartId));
    await deleteParkedCart(cartId);
  };

  return (
    <div className="flex w-full h-full divide-x divide-slate-200">

      {/* ── LEFT: Catalog ── */}
      <ProductCatalog
        manualProducts={manualProducts}
        categories={categories}
        searchQuery={searchQuery}
        selectedCategoryId={selectedCategoryId}
        isPending={isPending}
        filteredProducts={filteredProducts}
        onSearchChange={setSearchQuery}
        onCategoryChange={setSelectedCategoryId}
        onAddItem={onAddItem}
      />

      {/* ── RIGHT: Cart ── */}
      <div className="w-2/3 flex flex-col bg-white overflow-hidden relative">

        <CartHeader
          clientSearchText={clientSearchText}
          isSearchFocused={isSearchFocused}
          selectedClient={selectedClient}
          matchingClients={matchingClients}
          parkedCartsCount={parkedCarts.length}
          onSearchChange={val => { setClientSearchText(val); setIsSearchFocused(true); if (selectedClient) onClearClient(); }}
          onSearchFocus={() => setIsSearchFocused(true)}
          onSearchBlur={() => setIsSearchFocused(false)}
          onSelectClient={onSelectClient}
          onClearClient={onClearClient}
          onOpenParked={() => setIsParkedPanelOpen(true)}
        />

        {/* Cart body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          <CartItems
            items={sessionItems}
            onUpdateQty={onUpdateQty}
            onUpdatePrice={onUpdatePrice}
            onUpdatePriceBlur={onUpdatePriceBlur}
            onRemoveItem={onRemoveItem}
          />
        </div>

        {/* Footer */}
        {sessionItems.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 bg-white shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 flex justify-between items-center">
            <div>
              <p className="text-xs text-slate-400">
                {selectedClient ? `Attributing to ${selectedClient.name}` : 'Walk-in sale'}
              </p>
              <p className="text-xl font-black font-mono text-slate-800">${cartTotal.toFixed(2)}</p>
              {addToTabError && <p className="text-xs text-red-500 mt-0.5">{addToTabError}</p>}
            </div>
            <div className="flex items-center gap-2">
              {/* Park Sale — always available */}
              <button
                onClick={onParkSale}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-semibold rounded-xl disabled:opacity-50 transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1.343 9.01A2 2 0 008.33 19h7.34a2 2 0 001.987-1.99L19 8" />
                </svg>
                Park Sale
              </button>
              {/* Add to Tab — only when a client is selected */}
              {selectedClient && (
                <button
                  onClick={onOpenAddToTab}
                  disabled={isPending}
                  className="flex items-center gap-2 px-4 py-2.5 border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-700 font-semibold rounded-xl disabled:opacity-50 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Add to Tab
                </button>
              )}
              <button
                onClick={() => { setPaymentAmount(cartTotal.toFixed(2)); setPaymentMethod('Visa'); setIsPaymentModalOpen(true); }}
                disabled={isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-md disabled:opacity-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
                Pay
              </button>
            </div>
          </div>
        )}

        {/* Parked panel */}
        {isParkedPanelOpen && (
          <ParkedPanel
            parkedCarts={parkedCarts}
            clients={clients}
            onClose={() => setIsParkedPanelOpen(false)}
            onResume={onResumeCart}
            onDelete={onDeleteParkedCart}
          />
        )}

        {/* Payment modal */}
        {isPaymentModalOpen && (
          <SellPaymentModal
            cartTotal={cartTotal}
            clientName={selectedClient?.name}
            paymentAmount={paymentAmount}
            paymentMethod={paymentMethod}
            isPending={isPending}
            onAmountChange={setPaymentAmount}
            onMethodChange={setPaymentMethod}
            onConfirm={onPay}
            onClose={() => setIsPaymentModalOpen(false)}
          />
        )}

        {/* Visit selector modal ("Add to Tab") */}
        {isVisitSelectorOpen && selectedClient && (
          <VisitSelectorModal
            clientName={selectedClient.name}
            visits={clientVisits}
            selectedVisitId={selectedVisitId}
            cartTotal={cartTotal}
            isPending={isPending}
            onSelectVisit={setSelectedVisitId}
            onConfirm={() => confirmAddToTab(selectedVisitId)}
            onClose={() => setIsVisitSelectorOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
