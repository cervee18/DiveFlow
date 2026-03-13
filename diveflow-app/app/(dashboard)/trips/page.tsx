'use client';

import { useState } from 'react';

// Mock data to preview the UI based on your schema
const MOCK_TRIPS = [
  {
    id: '1',
    label: 'Morning 2-Tank Reef',
    type: 'Recreational',
    entry_mode: 'Boat',
    start_time: '2026-03-14T08:30:00Z',
    duration_minutes: 240,
    max_divers: 12,
    booked_divers: 8, // Derived count from trip_clients
  },
  {
    id: '2',
    label: 'Discover Scuba Diving',
    type: 'Course',
    entry_mode: 'Shore',
    start_time: '2026-03-14T10:00:00Z',
    duration_minutes: 180,
    max_divers: 4,
    booked_divers: 4,
  },
  {
    id: '3',
    label: 'Afternoon Wreck Dive',
    type: 'Advanced',
    entry_mode: 'Boat',
    start_time: '2026-03-14T13:30:00Z',
    duration_minutes: 180,
    max_divers: 12,
    booked_divers: 2,
  }
];

export default function TripsPage() {
  // Default to today
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // In a real scenario, you'd format the time based on the user's locale/timezone
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-slate-50">
      {/* LEFT COLUMN: Master View */}
      <div className="w-96 flex flex-col border-r border-slate-200 bg-slate-50">
        
        {/* Header & Date Picker */}
        <div className="p-4 border-b border-slate-200 bg-white z-10">
          <h1 className="text-xl font-semibold text-slate-800 mb-4">Daily Schedule</h1>
          <div className="relative">
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Chronological List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {MOCK_TRIPS.map((trip) => {
            const isSelected = selectedTripId === trip.id;
            const isFull = trip.booked_divers >= trip.max_divers;

            return (
              <button
                key={trip.id}
                onClick={() => setSelectedTripId(trip.id)}
                className={`w-full text-left transition-all ${
                  isSelected 
                    ? 'bg-white rounded-xl shadow-md border-2 border-blue-600' 
                    : 'bg-white rounded-xl shadow-sm border border-slate-200 hover:border-blue-300'
                } p-4`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <span className="text-lg font-bold text-slate-800">
                      {formatTime(trip.start_time)}
                    </span>
                    <span className="text-sm text-slate-500 font-medium mt-1">
                      {trip.duration_minutes / 60} hrs
                    </span>
                  </div>
                  
                  {/* Capacity Badge */}
                  <span className={`text-xs font-medium px-2 py-1 rounded-full border ${
                    isFull 
                      ? 'bg-amber-50 text-amber-600 border-amber-200' 
                      : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  }`}>
                    {trip.booked_divers} / {trip.max_divers} Divers
                  </span>
                </div>

                <h3 className="text-slate-800 font-medium mb-3 truncate">
                  {trip.label}
                </h3>

                <div className="flex gap-2">
                  <span className="bg-slate-100 text-slate-500 border border-slate-200 text-xs px-2 py-1 rounded-md">
                    {trip.entry_mode}
                  </span>
                  <span className="bg-slate-100 text-slate-500 border border-slate-200 text-xs px-2 py-1 rounded-md">
                    {trip.type}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: Detail View (Placeholder for now) */}
      <div className="flex-1 bg-slate-50 p-6 overflow-y-auto">
        {selectedTripId ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full p-8 flex items-center justify-center">
            <p className="text-slate-500">Trip manifest and details will go here.</p>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500">
            Select a trip from the timeline to view details
          </div>
        )}
      </div>
    </div>
  );
}