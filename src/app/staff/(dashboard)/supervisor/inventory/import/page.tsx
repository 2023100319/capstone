import { getImportLogs } from "@/app/actions/sales-import";
import { currentUser } from "@/lib/guards";
import { can } from "@/lib/roles";
import { SalesImportManager } from "./sales-import-manager";

export const dynamic = "force-dynamic";

export default async function SalesImportPage() {
  const [logs, actor] = await Promise.all([getImportLogs(), currentUser()]);

  return <SalesImportManager logs={logs} canManage={can(actor?.role, "manageInventory")} />;
}
