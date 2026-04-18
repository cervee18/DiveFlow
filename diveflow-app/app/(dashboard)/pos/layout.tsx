import { getAuthContext } from "@/utils/auth";
import POSInactivityGuard from "@/app/(dashboard)/components/POSInactivityGuard";

export default async function POSLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthContext();

  return (
    <POSInactivityGuard userEmail={user.email ?? ''}>
      {children}
    </POSInactivityGuard>
  );
}
