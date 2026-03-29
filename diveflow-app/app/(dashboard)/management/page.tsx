import StaffAllocator from "./components/StaffAllocator";

export default function ManagementPage() {
  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
      <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-white z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Management & Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Configure global dive center features and staff allocations.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <StaffAllocator />
        </div>
      </div>
    </div>
  );
}
