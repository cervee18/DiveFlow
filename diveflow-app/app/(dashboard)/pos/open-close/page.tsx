import { getSessionPageData } from './actions';
import OpenCloseClient from './OpenCloseClient';

export default async function POSOpenClosePage() {
  const data = await getSessionPageData();
  if (!data) return null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-slate-50 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Open / Close</h1>
        <p className="text-sm text-slate-500 mt-1">
          Open the POS at the start of the day and close it when done. Payments are blocked while the POS is closed.
        </p>
      </div>
      <OpenCloseClient
        openSession={data.openSession}
        lastClosed={data.lastClosed}
        summary={data.summary}
        transactionCount={data.transactionCount}
      />
    </div>
  );
}
