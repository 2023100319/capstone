import { ChefHat } from "lucide-react";
import { StationDisplay } from "@/components/brand/station-display";
import { getActiveOrders } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

export default async function OrderQueuePage() {
  const orders = await getActiveOrders();
  return <StationDisplay station="Order Queue" icon={ChefHat} orders={orders} />;
}
