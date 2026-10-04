import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhilippinePeso, ShoppingBag, CheckCircle2, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/brand/stat-card";
import { getCashierStats, getRecentOrders } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

export default async function CashierDashboard() {
  const [stats, recentOrders] = await Promise.all([getCashierStats(), getRecentOrders()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Daily Sales</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={`₱${stats.revenue.toLocaleString()}`}
          sub="Today"
          icon={PhilippinePeso}
          tint="blue"
        />
        <StatCard
          label="Total Orders"
          value={String(stats.totalOrders)}
          sub="All orders today"
          icon={ShoppingBag}
          tint="navy"
        />
        <StatCard
          label="Paid Orders"
          value={String(stats.paidOrders)}
          sub="Completed payments"
          icon={CheckCircle2}
          tint="green"
        />
        <StatCard
          label="Avg Order Value"
          value={`₱${stats.avgOrderValue.toLocaleString()}`}
          sub="Per paid order"
          icon={TrendingUp}
          tint="amber"
        />
      </div>

      {/* Recent Orders */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentOrders.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No orders yet today.</p>
          ) : (
            recentOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between border-b px-6 py-4 transition-colors last:border-0 hover:bg-muted/50"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{order.orderNumber}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {order.itemCount} item{order.itemCount === 1 ? "" : "s"} ·{" "}
                    {order.status.toLowerCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">₱{order.totalAmount}</p>
                  <p
                    className={`text-xs font-medium ${
                      order.isPaid ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {order.isPaid ? "paid" : "unpaid"}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
