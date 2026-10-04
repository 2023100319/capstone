import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOrders } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PREPARING: "bg-blue-50 text-brand-blue",
  READY: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-50 text-red-700",
};

function timeAgo(date: Date) {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function CashierOrdersPage() {
  const orders = await getOrders();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">All Orders</h1>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-medium text-muted-foreground">Order ID</TableHead>
                <TableHead className="font-medium text-muted-foreground">Type</TableHead>
                <TableHead className="font-medium text-muted-foreground">Items</TableHead>
                <TableHead className="font-medium text-muted-foreground">Total</TableHead>
                <TableHead className="font-medium text-muted-foreground">Status</TableHead>
                <TableHead className="font-medium text-muted-foreground">Payment</TableHead>
                <TableHead className="font-medium text-muted-foreground">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No orders yet.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow key={o.id} className="hover:bg-muted/40">
                    <TableCell className="font-medium text-foreground">{o.orderNumber}</TableCell>
                    <TableCell className="text-foreground/80">
                      {o.orderType === "DINE_IN" ? "Dine In" : "Take Out"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-foreground/80">
                      {o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}
                    </TableCell>
                    <TableCell className="font-semibold text-foreground">
                      ₱{o.totalAmount}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[o.status]}`}
                      >
                        {o.status.toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          o.paidAt
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {o.paidAt ? "Paid" : "Unpaid"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {timeAgo(o.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
