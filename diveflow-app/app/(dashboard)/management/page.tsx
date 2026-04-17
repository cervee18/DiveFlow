import ConfigurationClient from "./components/ConfigurationClient";
import { getAdminContext }  from "./actions";

export default async function ManagementPage() {
  const adminOrgId = await getAdminContext();
  return <ConfigurationClient orgId={adminOrgId} />;
}
