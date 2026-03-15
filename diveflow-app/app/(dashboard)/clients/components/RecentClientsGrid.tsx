interface RecentClientsGridProps {
  recentClients: any[];
  onSelectClient: (client: any) => void;
}

export default function RecentClientsGrid({ recentClients, onSelectClient }: RecentClientsGridProps) {
  return (
    <div className="overflow-y-auto pb-8">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Recently Added Divers</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {recentClients.map(client => (
          <button
            key={client.id}
            onClick={() => onSelectClient(client)}
            className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all text-left flex flex-col gap-2"
          >
            <div>
              <p className="font-medium text-slate-800">{client.first_name} {client.last_name}</p>
              <p className="text-sm text-slate-500">{client.email}</p>
            </div>
            <div className="mt-2 inline-block px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-600 w-fit">
              {client.certification_levels?.abbreviation || "No Certification Listed"}
            </div>
          </button>
        ))}
        {recentClients.length === 0 && (
          <p className="text-sm text-slate-500 col-span-3">No clients have been added yet.</p>
        )}
      </div>
    </div>
  );
}