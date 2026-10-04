import { getUnpaidOrders } from "@/app/actions/orders";
import { PaymentTerminal } from "./payment-terminal";

export const dynamic = "force-dynamic";

export default async function CashierPaymentPage() {
  const orders = await getUnpaidOrders();

  return (
    <PaymentTerminal
      orders={orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderType: o.orderType,
        status: o.status,
        totalAmount: o.totalAmount,
        items: o.items.map((i) => ({
          name: i.name,
          qty: i.qty,
          price: i.price,
          variation: i.variation,
        })),
      }))}
    />
  );
}
