import { getMovementAnalytics } from "@/app/actions/inventory-reports";
import { normalizeDays } from "@/lib/analytics-period";
import { InventoryReport } from "./inventory-report";

export const dynamic = "force-dynamic";

export default async function InventoryAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const period = normalizeDays(days);
  const analytics = await getMovementAnalytics(period);

  return <InventoryReport analytics={analytics} />;
}
