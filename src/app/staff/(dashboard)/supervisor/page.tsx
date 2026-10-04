import Link from "next/link";
import {
  Package, AlertTriangle, Clock, XCircle, History,
  PackagePlus, TrendingDown, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInventorySnapshot, getUsageRates } from "@/app/actions/reports";
import { getStockMovements, getExpiringSoon } from "@/app/actions/inventory";
import { getMovementAnalytics } from "@/app/actions/inventory-reports";
import { StatCard } from "@/components/brand/stat-card";
import { DecisionInsights } from "@/components/brand/decision-insights";
import { buildInsights } from "@/lib/insights";
import { headlineByUnit } from "@/lib/units";
import { monthLabel, currentMonth } from "@/types/reports";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MOVEMENT_TINT: Record<string, string> = {
  STOCK_IN: "bg-emerald-50 text-emerald-700 border-emerald-100",
  SALES_IMPORT: "bg-blue-50 text-blue-700 border-blue-100",
  ADJUSTMENT: "bg-amber-50 text-amber-700 border-amber-100",
  WASTAGE: "bg-orange-50 text-orange-700 border-orange-100",
  EXPIRY: "bg-red-50 text-red-700 border-red-100",
};

const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** This dashboard is Supervisor's own page, so its links can be absolute. */
const BASE = "/staff/supervisor";
const REPORT_7D = `${BASE}/inventory/analytics?days=7`;

export default async function SupervisorDashboard() {
  const [snapshot, movements, week, expiring, usageRates] = await Promise.all([
    getInventorySnapshot(),
    getStockMovements({ limit: 6 }),
    getMovementAnalytics(7),
    getExpiringSoon(7),
    getUsageRates(),
  ]);

  const { restock, prediction } = buildInsights(snapshot, expiring, usageRates);
  const blockedDishes = new Set(
    snapshot.blocked.filter((b) => b.status === "OUT_OF_STOCK").flatMap((b) => b.menuItems)
  ).size;

  const consumed = headlineByUnit(week.byIngredient.map((r) => ({ qty: r.consumed, unit: r.unit })));
  const loss = headlineByUnit(
    week.byIngredient.map((r) => ({ qty: r.wasted + r.expired, unit: r.unit }))
  );
  const restocked = headlineByUnit(
    week.byIngredient.map((r) => ({ qty: r.restocked, unit: r.unit }))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{monthLabel(currentMonth())}</p>
      </div>

      {/* Operational KPIs — each tile opens the screen that can act on it. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Need restock"
          value={String(snapshot.counts.LOW + snapshot.counts.OUT_OF_STOCK)}
          icon={AlertTriangle}
          tint="amber"
          href={`${BASE}/inventory/alerts`}
        />
        <StatCard
          label="Out of stock"
          value={String(snapshot.counts.OUT_OF_STOCK)}
          icon={XCircle}
          tint="red"
          href={`${BASE}/inventory/alerts`}
        />
        <StatCard
          label="Expiring in 7 days"
          value={String(snapshot.expiringSoon)}
          icon={Clock}
          tint="red"
          href={`${BASE}/inventory/alerts#expiring`}
        />
        <StatCard
          label="Dishes blocked"
          value={String(blockedDishes)}
          icon={Package}
          tint="navy"
          href={`${BASE}/inventory/availability`}
        />
      </div>

      {/* This week's flow — the same window the report opens on. Quantities are
          printed per unit family: the ingredients behind these are measured in
          g, kg, ml, L and pcs at once, so a single sum would be a number with no
          unit. See src/lib/units.ts. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Used up (7 days)"
          value={consumed.value}
          sub={consumed.rest ? `also ${consumed.rest}` : "deducted by sales imports"}
          icon={TrendingDown}
          tint="blue"
          href={REPORT_7D}
        />
        <StatCard
          label="Lost (7 days)"
          value={loss.value}
          sub={loss.rest ? `also ${loss.rest}` : "wastage and expiry"}
          icon={Trash2}
          tint="red"
          href={REPORT_7D}
        />
        <StatCard
          label="Restocked (7 days)"
          value={restocked.value}
          sub={restocked.rest ? `also ${restocked.rest}` : "received from deliveries"}
          icon={PackagePlus}
          tint="green"
          href={REPORT_7D}
        />
      </div>

      {/* Decision Support Insights — expand a tile for the rows behind it */}
      <DecisionInsights
        insights={[restock, prediction]}
        alertsHref="/staff/supervisor/inventory/alerts"
      />

      {/* Recent stock movements */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <History className="h-4 w-4 text-muted-foreground" />
            Recent Stock Movements
          </CardTitle>
          <Link href={REPORT_7D} className="text-xs font-medium text-primary hover:underline">
            View reports
          </Link>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock changes recorded yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {movements.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", MOVEMENT_TINT[m.type])}
                  >
                    {m.typeLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{m.ingredientName}</span>
                  <span
                    className={cn("text-sm font-semibold", m.change >= 0 ? "text-emerald-600" : "text-red-600")}
                  >
                    {m.change > 0 ? "+" : ""}
                    {num(m.change)} {m.unit}
                  </span>
                  <span className="hidden w-32 text-right text-xs text-muted-foreground sm:block">
                    {new Date(m.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
