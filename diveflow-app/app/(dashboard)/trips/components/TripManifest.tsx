'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function TripManifest({ tripId }: { tripId: string }) {
  const supabase = createClient();
  const [manifest, setManifest] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

useEffect(() => {
    async function fetchManifest() {
      if (!tripId) return;
      setIsLoading(true);

      const { data, error } = await supabase
        .from('trip_clients')
        .select(`
          *,
          clients ( first_name, last_name, cert_level ),
          courses ( name )
        `)
        .eq('trip_id', tripId); // Removed the .order() clause

      if (!error && data) {
        setManifest(data);
      } else {
        console.error("Error fetching manifest:", error);
      }
      setIsLoading(false);
    }

    fetchManifest();
  }, [tripId, supabase]);

  // Small helper to render checkmarks for boolean values
  const CheckMark = ({ checked }: { checked: boolean }) => {
    return checked ? (
      <svg className="w-4 h-4 text-emerald-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    ) : (
      <span className="text-slate-300">-</span>
    );
  };

  return (
    <div className="flex-1 flex flex-col mt-2">
      <div className="flex justify-between items-end mb-3">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
          Diver Manifest <span className="text-slate-400 font-normal ml-2">({manifest.length} onboard)</span>
        </h3>
        <button className="bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-blue-600 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors">
          + Add Diver
        </button>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading manifest...</div>
        ) : manifest.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
            <p className="text-slate-500 text-sm mb-3">No divers added to this trip yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium tracking-wide">
                  <th className="px-3 py-2 w-8 text-center">#</th>
                  <th className="px-3 py-2">Client Name</th>
                  <th className="px-3 py-2">Cert / Course</th>
                  <th className="px-3 py-2 text-center">Nitrox</th>
                  <th className="px-3 py-2 text-center">Mask</th>
                  <th className="px-3 py-2 text-center">Fins</th>
                  <th className="px-3 py-2 text-center">BCD</th>
                  <th className="px-3 py-2 text-center">Reg</th>
                  <th className="px-3 py-2 text-center">Wetsuit</th>
                  <th className="px-3 py-2 text-center">Comp</th>
                  <th className="px-3 py-2 w-full">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {manifest.map((diver, index) => (
                  <tr key={diver.id} className="hover:bg-slate-50 transition-colors">
                    {/* Roll Call Checkbox/Index */}
                    <td className="px-3 py-1.5 text-center text-slate-400 font-medium border-r border-slate-100">
                      {index + 1}
                    </td>
                    
                    {/* Name */}
                    <td className="px-3 py-1.5 font-semibold text-slate-900 border-r border-slate-100">
                      {diver.clients?.first_name} {diver.clients?.last_name}
                    </td>
                    
                    {/* Cert / Course */}
                    <td className="px-3 py-1.5 border-r border-slate-100">
                      {diver.courses?.name ? (
                        <span className="text-blue-700 font-medium bg-blue-50 px-1.5 py-0.5 rounded">
                          {diver.courses.name}
                        </span>
                      ) : (
                        <span className="text-slate-500">{diver.clients?.cert_level || 'OW'}</span>
                      )}
                    </td>

                    {/* Nitrox */}
                    <td className="px-3 py-1.5 text-center border-r border-slate-100">
                      {diver.nitrox ? (
                        <span className="font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                          {diver.nitrox_percentage}%
                        </span>
                      ) : (
                        <span className="text-slate-300">Air</span>
                      )}
                    </td>

                    {/* Equipment - Text based sizes */}
                    <td className="px-3 py-1.5 text-center font-medium border-r border-slate-100">{diver.mask || '-'}</td>
                    <td className="px-3 py-1.5 text-center font-medium border-r border-slate-100">{diver.fins || '-'}</td>
                    <td className="px-3 py-1.5 text-center font-medium border-r border-slate-100">{diver.bcd || '-'}</td>
                    
                    {/* Equipment - Booleans */}
                    <td className="px-3 py-1.5 text-center border-r border-slate-100"><CheckMark checked={diver.regulator} /></td>
                    
                    {/* Equipment - Text based sizes */}
                    <td className="px-3 py-1.5 text-center font-medium border-r border-slate-100">{diver.wetsuit || '-'}</td>
                    
                    {/* Equipment - Booleans */}
                    <td className="px-3 py-1.5 text-center border-r border-slate-100"><CheckMark checked={diver.computer} /></td>
                    
                    {/* Notes (Allows text wrapping if it gets long) */}
                    <td className="px-3 py-1.5 text-slate-500 truncate max-w-[200px]" title={diver.notes || ''}>
                      {diver.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}