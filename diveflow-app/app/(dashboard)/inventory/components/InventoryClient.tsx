"use client";

import { useState } from "react";
import BulkInventoryTable from "./BulkInventoryTable";
import SerializedSearch from "./SerializedSearch";

export default function InventoryClient({ 
  initialBulkItems, 
  categories 
}: { 
  initialBulkItems: any[], 
  categories: any[] 
}) {
  const [activeTab, setActiveTab] = useState<"bulk" | "serialized">("bulk");

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      
      {/* Mobile Tabs Header - Hidden on large screens */}
      <div className="flex border-b border-slate-200 lg:hidden">
        <button
          onClick={() => setActiveTab("bulk")}
          className={`flex-1 py-4 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "bulk"
              ? "border-teal-500 text-teal-600"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          Bulk Equipment
        </button>
        <button
          onClick={() => setActiveTab("serialized")}
          className={`flex-1 py-4 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "serialized"
              ? "border-teal-500 text-teal-600"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          Serialized Search
        </button>
      </div>

      {/* Mobile Tab Content - Hidden on large screens */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50 lg:hidden">
        {activeTab === "bulk" ? (
          <BulkInventoryTable 
            items={initialBulkItems} 
            categories={categories} 
          />
        ) : (
          <SerializedSearch 
            categories={categories} 
          />
        )}
      </div>

      {/* Desktop Column Layout - Hidden on mobile screens */}
      <div className="hidden lg:flex flex-1 h-full min-h-0">
        
        {/* Bulk Column */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 border-r border-slate-200">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200/60">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Bulk Equipment</h2>
              <p className="text-xs text-slate-500">Manage total quantities per size.</p>
            </div>
          </div>
          <BulkInventoryTable 
            items={initialBulkItems} 
            categories={categories} 
          />
        </div>

        {/* Serialized Column */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200/60">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Serialized Pipeline</h2>
              <p className="text-xs text-slate-500">Track exact units by their serial number.</p>
            </div>
          </div>
          <SerializedSearch 
            categories={categories} 
          />
        </div>

      </div>

    </div>
  );
}
