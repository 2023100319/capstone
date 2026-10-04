import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, Clock, History, ArrowUpRight, TrendingDown, Trash2 } from "lucide-react";
import { getInventorySnapshot, getMostPurchased, getUsageRates } from "@/app/actions/reports";
import { getStockMovements, getExpiringSoon } from "@/app/actions/inventory";
import { getMovementAnalytics } from "@/app/actions/inventory-reports";
import { DecisionInsights } from "@/components/brand/decision-insights";
import { buildInsights } from "@/lib/insights";
import { headlineByUnit } from "@/lib/units";
import { monthLabel, currentMonth } from "@/types/reports";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Orange warns that stock is running out; red means there is none left. Keep
// these in step with the donut below — they read the same three counts.
const STATUS_CHIP: Record<string, { dot: string; chip: string; label: string }> = {
  GOOD: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-100", label: "In Stock" },
  LOW: { dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 border-orange-100", label: "Low Stock" },
  OUT_OF_STOCK: { dot: "bg-red-500", chip: "bg-red-50 text-red-700 border-red-100", label: "Out Of Stock" },
};

// Ledger row tints — additions read green, deductions red.
const MOVEMENT_TINT: Record<string, string> = {
  STOCK_IN: "bg-emerald-50 text-emerald-700 border-emerald-100",
  SALES_IMPORT: "bg-blue-50 text-blue-700 border-blue-100",
  ADJUSTMENT: "bg-amber-50 text-amber-700 border-amber-100",
  WASTAGE: "bg-orange-50 text-orange-700 border-orange-100",
  EXPIRY: "bg-red-50 text-red-700 border-red-100",
};

/** Donut arcs for the stock mix, sized from the real counts. */
function donutArcs(counts: { GOOD: number; LOW: number; OUT_OF_STOCK: number }, total: number) {
  const circumference = 2 * Math.PI * 35;
  const segments = [
    { key: "GOOD", value: counts.GOOD, color: "#10b981" },
    { key: "LOW", value: counts.LOW, color: "#f97316" },
    { key: "OUT_OF_STOCK", value: counts.OUT_OF_STOCK, color: "#ef4444" },
  ].filter((s) => s.value > 0);

  let offset = 0;
  return segments.map((s) => {
    const length = total > 0 ? (s.value / total) * circumference : 0;
    const arc = {
      ...s,
      dasharray: `${length} ${circumference}`,
      dashoffset: -offset,
    };
    offset += length;
    return arc;
  });
}

/** This dashboard is the Owner's own page, so its links can be absolute. */
const BASE = "/staff/owner";
const REPORT_30D = `${BASE}/inventory/analytics?days=30`;

/** The "View →" affordance every panel header carries. */
function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-xs font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}

function fmtChange(change: number, unit: string) {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

export default async function OwnerDashboard() {
  const [snapshot, mostPurchased, movements, analytics, expiring, usageRates] = await Promise.all([
    getInventorySnapshot(),
    getMostPurchased(4),
    getStockMovements({ limit: 6 }),
    getMovementAnalytics(30),
    getExpiringSoon(7),
    getUsageRates(),
  ]);

  const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const maxConsumed = Math.max(1, ...analytics.topConsumed.map((i) => i.qty));
  const maxPurchased = Math.max(1, ...mostPurchased.map((i) => i.quantity));
  const arcs = donutArcs(snapshot.counts, snapshot.total);
  const needRestock = snapshot.counts.LOW + snapshot.counts.OUT_OF_STOCK;

  const { restock, expiring: expiringInsight } = buildInsights(snapshot, expiring, usageRates);

  const lossSplit = {
    total: headlineByUnit(
      analytics.byIngredient.map((r) => ({ qty: r.wasted + r.expired, unit: r.unit })),
      "None"
    ),
    wasted: headlineByUnit(
      analytics.byIngredient.map((r) => ({ qty: r.wasted, unit: r.unit })),
      "None"
    ),
    expired: headlineByUnit(
      analytics.byIngredient.map((r) => ({ qty: r.expired, unit: r.unit })),
      "None"
    ),
  };

  // Clickable overview tiles — the Owner's jump-off points into the read-only
  // oversight screens.
  const tiles = [
    { icon: <Package className="h-5 w-5" />, value: snapshot.total, label: "Total Ingredients", color: "bg-brand-navy text-white", href: "/staff/owner/inventory" },
    { icon: <AlertTriangle className="h-5 w-5" />, value: needRestock, label: "Need restock", color: "bg-orange-500 text-white", href: "/staff/owner/inventory/alerts" },
    { icon: <Clock className="h-5 w-5" />, value: snapshot.expiringSoon, label: "Expiring within 7 days", color: "bg-red-500 text-white", href: "/staff/owner/inventory/alerts" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{monthLabel(currentMonth())}</p>
      </div>

      {/* Inventory Status */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Inventory Status</CardTitle>
          <PanelLink href={`${BASE}/inventory/alerts`}>Reorder &amp; alerts</PanelLink>
        </CardHeader>
        <CardContent>
          {snapshot.attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All {snapshot.total} ingredients are well stocked.
            </p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {/* A preview row — the full list lives in the insights drill-down
                  and on the Reorder & Alerts screen. */}
              {snapshot.attention.slice(0, 6).map((item) => {
                const style = STATUS_CHIP[item.status];
                return (
                  <div key={item.id} className={cn("min-w-40 rounded-xl border px-5 py-4", style.chip)}>
                    <p className="text-sm opacity-80">{item.name}</p>
                    <p className="mt-1 flex items-center gap-2 text-lg font-bold">
                      <span className={cn("h-2.5 w-2.5 rounded-full", style.dot)} />
                      {style.label}
                    </p>
                    <p className="mt-0.5 text-xs opacity-70">
                      {item.stockQuantity.toLocaleString()} {item.unit} left
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Decision Support Insights — expand a tile for the rows behind it */}
      <DecisionInsights
        insights={[restock, expiringInsight]}
        alertsHref="/staff/owner/inventory/alerts"
      />

      {/* Overview tiles — clickable jump-offs into the oversight screens */}
      <div className="flex flex-wrap gap-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="min-w-48 flex-1">
            <Card className="border-0 shadow-sm transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 pt-5">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", tile.color)}>
                  {tile.icon}
                </div>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-foreground">{tile.value}</p>
                  <p className="text-xs text-muted-foreground">{tile.label}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Most Purchased — ranked by quantity restocked */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold text-foreground">
              Most Restocked Ingredients
            </CardTitle>
            {/* Deliveries are what this counts, so it opens the Suppliers page. */}
            <PanelLink href={`${BASE}/suppliers`}>Suppliers</PanelLink>
          </CardHeader>
          <CardContent>
            {mostPurchased.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No stock deliveries recorded yet. Use Add Stock on the Inventory page.
              </p>
            ) : (
              <div className="space-y-3">
                {mostPurchased.map((item) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className="w-32 flex-shrink-0 truncate text-right text-sm text-foreground/80">
                      {item.name}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded-lg bg-muted">
                      <div
                        className="h-full rounded-lg bg-emerald-500/80"
                        style={{ width: `${(item.quantity / maxPurchased) * 100}%` }}
                      />
                    </div>
                    <span className="w-24 text-right text-sm text-muted-foreground">
                      {item.quantity.toLocaleString()} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stock level donut */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold text-foreground">
              Stock Level Distribution
            </CardTitle>
            <PanelLink href={`${BASE}/inventory`}>Inventory</PanelLink>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <svg viewBox="0 0 100 100" className="h-40 w-40 -rotate-90">
              <circle cx="50" cy="50" r="35" fill="none" stroke="#e5e7eb" strokeWidth="18" />
              {arcs.map((arc) => (
                <circle
                  key={arc.key}
                  cx="50"
                  cy="50"
                  r="35"
                  fill="none"
                  stroke={arc.color}
                  strokeWidth="18"
                  strokeDasharray={arc.dasharray}
                  strokeDashoffset={arc.dashoffset}
                />
              ))}
              <text
                x="50"
                y="50"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="16"
                fontWeight="bold"
                fill="#1a2332"
                transform="rotate(90 50 50)"
              >
                {snapshot.total}
              </text>
            </svg>
            <div className="mt-3 flex flex-wrap justify-center gap-4">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-emerald-500" />
                <span className="text-xs text-muted-foreground">Good ({snapshot.counts.GOOD})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-orange-500" />
                <span className="text-xs text-muted-foreground">Low ({snapshot.counts.LOW})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-xs text-muted-foreground">
                  Out ({snapshot.counts.OUT_OF_STOCK})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loss & consumption (30 days) — the oversight view of the ledger */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Trash2 className="h-4 w-4 text-red-500" />
              Loss (last 30 days)
            </CardTitle>
            <PanelLink href={REPORT_30D}>View report</PanelLink>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Per unit family, not one sum: these ingredients are measured in
                g, kg, ml, L and pcs at once. See src/lib/units.ts. */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total loss", split: lossSplit.total, tint: "text-red-600" },
                { label: "Wasted", split: lossSplit.wasted, tint: "text-orange-600" },
                { label: "Expired", split: lossSplit.expired, tint: "text-red-500" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                  <p className={cn("truncate text-xl font-bold", s.tint)}>{s.split.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  {s.split.rest && (
                    <p className="truncate text-xs text-foreground/70">also {s.split.rest}</p>
                  )}
                </div>
              ))}
            </div>
            {analytics.topWasted.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Most lost: <span className="font-medium text-foreground">{analytics.topWasted[0].name}</span> (
                {num(analytics.topWasted[0].qty)} {analytics.topWasted[0].unit})
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <TrendingDown className="h-4 w-4 text-brand-blue" />
              Top Consumed (last 30 days)
            </CardTitle>
            <PanelLink href={REPORT_30D}>View report</PanelLink>
          </CardHeader>
          <CardContent>
            {analytics.topConsumed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No consumption recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {analytics.topConsumed.slice(0, 5).map((item) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className="w-32 flex-shrink-0 truncate text-right text-sm text-foreground/80">
                      {item.name}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded-lg bg-muted">
                      <div
                        className="h-full rounded-lg bg-brand-blue/70"
                        style={{ width: `${(item.qty / maxConsumed) * 100}%` }}
                      />
                    </div>
                    <span className="w-24 text-right text-sm text-muted-foreground">
                      {num(item.qty)} {item.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent stock movements — the ledger at a glance */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <History className="h-4 w-4 text-muted-foreground" />
            Recent Stock Movements
          </CardTitle>
          {/* Who did what, in words — the Activity feed is the Owner's audit
              trail. Hidden at the client's request (2026-09-13); the feed page
              itself still exists. Uncomment to bring the link back. */}
          {/* <PanelLink href={`${BASE}/activity`}>Staff activity</PanelLink> */}
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock changes recorded yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {movements.map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      MOVEMENT_TINT[m.type]
                    )}
                  >
                    {m.typeLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {m.ingredientName}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      m.change >= 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {fmtChange(m.change, m.unit)}
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
