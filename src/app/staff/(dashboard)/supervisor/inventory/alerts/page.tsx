import { getReorderList, getExpiringSoon } from "@/app/actions/inventory";
import { currentUser } from "@/lib/guards";
import { can } from "@/lib/roles";
import { StockAlerts } from "./stock-alerts";

export const dynamic = "force-dynamic";

export default async function StockAlertsPage() {
  const [reorder, expiring, actor] = await Promise.all([
    getReorderList(),
    getExpiringSoon(7),
    currentUser(),
  ]);

  return (
    <StockAlerts
      reorder={reorder}
      expiring={expiring}
      canManage={can(actor?.role, "manageInventory")}
    />
  );
}
