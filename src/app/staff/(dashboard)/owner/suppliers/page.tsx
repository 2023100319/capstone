import { getSupplierOverview } from "@/app/actions/inventory-reports";
import { SuppliersView } from "./suppliers-view";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const period = Number(days) || 0;
  const suppliers = await getSupplierOverview(period || undefined);

  return <SuppliersView suppliers={suppliers} days={period} />;
}
