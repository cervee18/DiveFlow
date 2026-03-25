import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function AddDiverModal({ isOpen, onClose, tripId, tripDate, onSuccess }: any) {
  const supabase = createClient();
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Flow State
  const [step, setStep] = useState<'search' | 'error' | 'companions'>('search');
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Companion State
  const [primaryClient, setPrimaryClient] = useState<any>(null);
  const [companions, setCompanions] = useState<any[]>([]);
  const [selectedToBook, setSelectedToBook] = useState<Set<string>>(new Set());

  // Reset modal when opened/closed
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

  // Debounced Search
  useEffect(() => {
    if (!isOpen || step !== 'search') return;
    const searchClients = async () => {
      if (searchTerm.trim().length < 2) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      const { data } = await supabase
        .from('clients')
        .select(`
          id, 
          first_name, 
          last_name, 
          email, 
          certification_levels!cert_level ( abbreviation )
        `)
        .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`)
        .limit(10);
      
      if (data) setResults(data);
      setIsSearching(false);
    };

    const delayDebounceFn = setTimeout(searchClients, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, isOpen, step, supabase]);

  // --------------------------------------------------------
  // STEP 1: Validate Visit & Fetch Companions
  // --------------------------------------------------------
  const handleSelectClient = async (client: any) => {
    setIsProcessing(true);
    setPrimaryClient(client);

    // Extract just the YYYY-MM-DD from the trip's start_time timestamp
    const d = new Date(tripDate);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const tripDateOnly = `${year}-${month}-${day}`;

    // 1. Check if the client has an active visit overlapping this date
    const { data: activeVisits, error: visitError } = await supabase
      .from('visit_clients')
      .select(`
        visit_id,
        visits!inner ( start_date, end_date )
      `)
      .eq('client_id', client.id)
      .lte('visits.start_date', tripDateOnly)
      .gte('visits.end_date', tripDateOnly);

    if (visitError || !activeVisits || activeVisits.length === 0) {
      setErrorMessage(`${client.first_name} does not have an active visit recorded for this trip date (${tripDateOnly}). Please update their visit dates first.`);
      setStep('error');
      setIsProcessing(false);
      return;
    }

    const currentVisitId = activeVisits[0].visit_id;

    // 2. Fetch companions on this exact same visit
    const { data: companionData } = await supabase
      .from('visit_clients')
      .select(`
        client_id,
        clients ( 
          id, 
          first_name, 
          last_name, 
          certification_levels!cert_level(abbreviation) 
        )
      `)
      .eq('visit_id', currentVisitId)
      .neq('client_id', client.id); // Exclude the primary person

    if (companionData && companionData.length > 0) {
      // Companions found! Move to step 2.
      const formattedCompanions = companionData.map((c: any) => c.clients);
      setCompanions(formattedCompanions);
      
// Auto-select the primary client AND all of their companions
      const allSelectedIds = [client.id, ...companionData.map((c: any) => c.client_id)];
      setSelectedToBook(new Set(allSelectedIds));
      setStep('companions');
    } else {
      // No companions, just book them immediately
      executeBooking([client.id]);
    }
    setIsProcessing(false);
  };

  // Toggle checkbox for companions
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedToBook);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedToBook(newSet);
  };

  // --------------------------------------------------------
  // STEP 2: Execute the Insert + pre-fill via DB function
  // --------------------------------------------------------
  const executeBooking = async (clientIdsToBook: string[]) => {
    setIsProcessing(true);

    const d = new Date(tripDate);
    const tripDateOnly = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const { error } = await supabase.rpc('add_clients_to_trip', {
      p_trip_id:    tripId,
      p_client_ids: clientIdsToBook,
      p_trip_date:  tripDateOnly,
    });

    if (error) {
      if (error.code === '23505') {
        alert("One or more of these divers is already on the manifest!");
      } else {
        console.error("Error adding divers:", error);
        alert("Could not add divers. Please try again.");
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
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">
            {step === 'companions' ? 'Add Companions' : 'Add Diver to Manifest'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        {/* VIEW 1: SEARCH */}
        {step === 'search' && (
          <>
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <input 
                  type="text" autoFocus placeholder="Search by first or last name..." 
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-4 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
            </div>
            <div className="flex-1 max-h-[400px] overflow-y-auto bg-slate-50 p-2">
              {results.map((client) => (
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
            </div>
          </>
        )}

        {/* VIEW 2: ERROR (Outside Visit Dates) */}
        {step === 'error' && (
          <div className="p-8 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Invalid Trip Date</h3>
            <p className="text-sm text-slate-600 mb-6">{errorMessage}</p>
            <button 
              onClick={() => setStep('search')}
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-6 py-2 rounded-lg font-bold transition-colors"
            >
              Back to Search
            </button>
          </div>
        )}

        {/* VIEW 3: COMPANION SELECTION */}
        {step === 'companions' && (
          <div className="p-4 bg-slate-50 flex flex-col h-full max-h-[400px]">
            <p className="text-sm text-slate-600 mb-4">
              We found companions traveling with <strong>{primaryClient?.first_name}</strong> on this date. Select who you want to add to the manifest:
            </p>
            
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {/* Primary Client (Auto-Selected) */}
              <label className="flex items-center gap-3 p-3 bg-white border-2 border-teal-500 rounded-lg cursor-pointer shadow-sm">
                <input type="checkbox" checked={selectedToBook.has(primaryClient.id)} onChange={() => toggleSelection(primaryClient.id)} className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500" />
                <div className="font-bold text-slate-800">
                  {primaryClient.first_name} {primaryClient.last_name} 
                  <span className="text-[10px] font-normal text-teal-600 ml-2">(Selected)</span>
                </div>
              </label>

              {/* Companions */}
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
                {isProcessing ? 'Adding...' : `Add ${selectedToBook.size} Divers`}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}