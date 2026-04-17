import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function AddDiverModal({ isOpen, onClose, tripId, tripDate, onSuccess }: any) {
  const supabase = createClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [step, setStep] = useState<'search' | 'error' | 'companions'>('search');
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [primaryClient, setPrimaryClient] = useState<any>(null);
  const [companions, setCompanions] = useState<any[]>([]);
  const [selectedToBook, setSelectedToBook] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) {
      setStep('search');
      setSearchTerm('');
      setResults([]);
      setPrimaryClient(null);
      setCompanions([]);
      setSelectedToBook(new Set());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || step !== 'search') return;
    const searchClients = async () => {
      if (searchTerm.trim().length < 2) { setResults([]); return; }
      setIsSearching(true);
      const { data } = await supabase
        .from('clients')
        .select(`id, first_name, last_name, email, certification_levels!cert_level(abbreviation)`)
        .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)
        .limit(10);
      if (data) setResults(data);
      setIsSearching(false);
    };
    const t = setTimeout(searchClients, 300);
    return () => clearTimeout(t);
  }, [searchTerm, isOpen, step, supabase]);

  const tripDateOnly = (() => {
    const d = new Date(tripDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const handleSelectClient = async (client: any) => {
    setIsProcessing(true);
    setPrimaryClient(client);

    // Fetch requires_visit separately so the search query stays simple
    // (avoids PostgREST schema cache issues with newly added columns)
    const { data: clientMeta } = await supabase
      .from('clients')
      .select('requires_visit')
      .eq('id', client.id)
      .single();
    const requiresVisit: boolean = clientMeta?.requires_visit ?? true;

    if (!requiresVisit) {
      // Local resident — book directly, no visit needed, no companion lookup
      executeBooking([client.id]);
      return;
    }

    // ── Requires visit: check coverage ──────────────────────────────────────
    const { data: activeVisits, error: visitError } = await supabase
      .from('visit_clients')
      .select('visit_id, visits!inner(id, start_date, end_date)')
      .eq('client_id', client.id)
      .lte('visits.start_date', tripDateOnly)
      .gte('visits.end_date', tripDateOnly);

    if (visitError || !activeVisits || activeVisits.length === 0) {
      setErrorMessage(
        `${client.first_name} ${client.last_name} requires an active visit covering ${tripDateOnly}. ` +
        `Create a visit for this date range first, or mark them as a local resident in their profile.`
      );
      setStep('error');
      setIsProcessing(false);
      return;
    }

    const currentVisitId = activeVisits[0].visit_id;

    // Fetch companions on the same visit (also requires_visit = true, same logic)
    const { data: companionData } = await supabase
      .from('visit_clients')
      .select(`client_id, clients(id, first_name, last_name, requires_visit, certification_levels!cert_level(abbreviation))`)
      .eq('visit_id', currentVisitId)
      .neq('client_id', client.id);

    if (companionData && companionData.length > 0) {
      const formattedCompanions = companionData.map((c: any) => c.clients);
      setCompanions(formattedCompanions);
      const allIds = [client.id, ...companionData.map((c: any) => c.client_id)];
      setSelectedToBook(new Set(allIds));
      setStep('companions');
    } else {
      executeBooking([client.id]);
    }
    setIsProcessing(false);
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedToBook);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedToBook(next);
  };

  const executeBooking = async (clientIdsToBook: string[]) => {
    setIsProcessing(true);
    const { error } = await supabase.rpc('add_clients_to_trip', {
      p_trip_id:    tripId,
      p_client_ids: clientIdsToBook,
      p_trip_date:  tripDateOnly,
    });

    if (error) {
      if (error.code === '23505') {
        setErrorMessage('One or more of these divers is already on the manifest.');
        setStep('error');
      } else if (error.code === 'restrict_violation' || error.message?.includes('requires an active visit')) {
        // DB trigger fired — surface the message directly
        setErrorMessage(error.message);
        setStep('error');
      } else {
        console.error('Error adding divers:', error);
        setErrorMessage('Could not add divers. Please try again.');
        setStep('error');
      }
      setIsProcessing(false);
      return;
    }

    onSuccess();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center z-[100] p-4 pt-20">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">

        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">
            {step === 'companions' ? 'Add Companions' : 'Add Diver to Manifest'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* SEARCH */}
        {step === 'search' && (
          <>
            <div className="p-4 border-b border-slate-100">
              <input
                type="text" autoFocus placeholder="Search by first or last name..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div className="flex-1 max-h-[400px] overflow-y-auto bg-slate-50 p-2">
              {results.map(client => (
                  <div key={client.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 mb-1 shadow-sm hover:border-teal-300 transition-colors">
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-2">
                        {client.first_name} {client.last_name}
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold border border-slate-200">
                          {client.certification_levels?.abbreviation || 'OW'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{client.email || 'No email on file'}</div>
                    </div>
                    <button
                      onClick={() => handleSelectClient(client)}
                      disabled={isProcessing}
                      className="bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white border border-teal-200 hover:border-teal-600 px-3 py-1.5 rounded-md text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {isProcessing && primaryClient?.id === client.id ? 'Checking...' : '+ Add'}
                    </button>
                  </div>
              ))}
              {results.length === 0 && searchTerm.length >= 2 && !isSearching && (
                <p className="text-center text-sm text-slate-400 py-8">No clients found.</p>
              )}
            </div>
          </>
        )}

        {/* ERROR */}
        {step === 'error' && (
          <div className="p-8 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Cannot Add Diver</h3>
            <p className="text-sm text-slate-600 mb-6">{errorMessage}</p>
            <button
              onClick={() => { setStep('search'); setPrimaryClient(null); }}
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-6 py-2 rounded-lg font-bold transition-colors"
            >
              Back to Search
            </button>
          </div>
        )}

        {/* COMPANION SELECTION */}
        {step === 'companions' && (
          <div className="p-4 bg-slate-50 flex flex-col h-full max-h-[400px]">
            <p className="text-sm text-slate-600 mb-4">
              We found companions traveling with <strong>{primaryClient?.first_name}</strong> on this date. Select who to add:
            </p>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              <label className="flex items-center gap-3 p-3 bg-white border-2 border-teal-500 rounded-lg cursor-pointer shadow-sm">
                <input type="checkbox" checked={selectedToBook.has(primaryClient.id)} onChange={() => toggleSelection(primaryClient.id)} className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500" />
                <div className="font-bold text-slate-800">
                  {primaryClient.first_name} {primaryClient.last_name}
                  <span className="text-[10px] font-normal text-teal-600 ml-2">(Selected)</span>
                </div>
              </label>
              {companions.map(comp => (
                <label key={comp.id} className={`flex items-center gap-3 p-3 bg-white border rounded-lg cursor-pointer transition-colors ${selectedToBook.has(comp.id) ? 'border-teal-500 bg-teal-50/30' : 'border-slate-200 hover:border-teal-300'}`}>
                  <input type="checkbox" checked={selectedToBook.has(comp.id)} onChange={() => toggleSelection(comp.id)} className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500" />
                  <div className="font-bold text-slate-800">
                    {comp.first_name} {comp.last_name}
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold border border-slate-200 ml-2">
                      {comp.certification_levels?.abbreviation || 'OW'}
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button onClick={() => setStep('search')} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={() => executeBooking(Array.from(selectedToBook))}
                disabled={isProcessing || selectedToBook.size === 0}
                className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {isProcessing ? 'Adding...' : `Add ${selectedToBook.size} Diver${selectedToBook.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
