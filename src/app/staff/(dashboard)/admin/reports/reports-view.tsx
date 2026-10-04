"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Download, TrendingUp, TrendingDown, PhilippinePeso, ShoppingCart, Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/brand/stat-card";
import {
  REPORT_RANGES, RANGE_LABELS, monthLabel, type ReportData,
} from "@/types/reports";
import { cn } from "@/lib/utils";

const peso = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function ReportsView({
  report,
  months,
  products,
}: {
  report: ReportData;
  months: { value: string; label: string }[];
  products: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  const byProduct = report.productName !== null;

  /** Filters live in the URL so the server refetches and Print/CSV stay in sync. */
  function apply(changes: Record<string, string>) {
    const params = new URLSearchParams({
      range: report.range,
      month: report.month,
      ...(report.menuItemId ? { product: report.menuItemId } : {}),
      ...changes,
    });
    for (const [key, value] of [...params]) if (!value) params.delete(key);
    router.push(`${pathname}?${params}`);
  }

  const exportHref = `/staff/reports/export?range=${report.range}&month=${report.month}${
    report.menuItemId ? `&product=${report.menuItemId}` : ""
  }`;

  const periodLabel =
    report.range === "MONTH" ? monthLabel(report.month) : RANGE_LABELS[report.range];

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {periodLabel} · {report.productName ?? "all products"} · paid orders only
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={exportHref}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted"
          >
            <Download className="h-4 w-4" /> Download Excel
          </a>
        </div>
      </div>

      {/* Range tabs — links, so the server actually refetches */}
      <div className="flex flex-wrap gap-2 print:hidden">
        {REPORT_RANGES.map((r) => (
          <Link
            key={r}
            href={`${pathname}?range=${r}&month=${report.month}${
              report.menuItemId ? `&product=${report.menuItemId}` : ""
            }`}
            className={cn(
              "rounded-lg px-5 py-2 text-sm font-medium transition-all",
              report.range === r
                ? "bg-primary text-primary-foreground shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
            )}
          >
            {RANGE_LABELS[r]}
          </Link>
        ))}
      </div>

      {/* Month + product filters */}
      <div className="flex flex-wrap items-end gap-4 print:hidden">
        {report.range === "MONTH" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Month</span>
            <select
              value={report.month}
              onChange={(e) => apply({ month: e.target.value })}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Product</span>
          <select
            value={report.menuItemId}
            onChange={(e) => apply({ product: e.target.value })}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Revenue" value={peso(report.revenue)} icon={TrendingUp} tint="green" />
        {byProduct ? (
          <StatCard label="Units Sold" value={String(report.unitsSold)} icon={Package} tint="blue" />
        ) : (
          <StatCard
            label="Total Expenses"
            value={peso(report.expenses)}
            icon={TrendingDown}
            tint="red"
          />
        )}
        <StatCard
          label="Net Profit"
          value={byProduct ? "—" : peso(report.profit)}
          icon={PhilippinePeso}
          tint={byProduct || report.profit >= 0 ? "blue" : "red"}
        />
        <StatCard label="Paid Orders" value={String(report.orderCount)} icon={ShoppingCart} tint="amber" />
      </div>

      {byProduct && (
        <p className="rounded-lg bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
          Expenses and net profit are shown for the whole store only. Stock is bought per
          ingredient, so its cost can&apos;t be split across individual products.
        </p>
      )}

      {/* Sales breakdown */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">
            Sales Breakdown · {periodLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {report.series.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              No paid orders{byProduct ? " for this product" : " or stock purchases"} in this period
              yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-6 py-3 text-left font-medium text-muted-foreground">Period</th>
                    <th className="px-6 py-3 text-right font-medium text-muted-foreground">
                      Revenue
                    </th>
                    {!byProduct && (
                      <>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">
                          Expenses
                        </th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">
                          Net
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {report.series.map((point) => (
                    <tr key={point.date} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-6 py-3 font-medium text-foreground">{point.date}</td>
                      <td className="px-6 py-3 text-right text-foreground/80">
                        {peso(point.revenue)}
                      </td>
                      {!byProduct && (
                        <>
                          <td className="px-6 py-3 text-right text-foreground/80">
                            {peso(point.expenses)}
                          </td>
                          <td
                            className={cn(
                              "px-6 py-3 text-right font-semibold",
                              point.revenue - point.expenses >= 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            )}
                          >
                            {peso(point.revenue - point.expenses)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top items */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">
            {byProduct ? "Product Total" : "Top Menu Items"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {report.topItems.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No sales in this period.</p>
          ) : (
            report.topItems.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between border-b px-6 py-4 transition-colors last:border-0 hover:bg-muted/50"
              >
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{peso(item.revenue)}</p>
                  <p className="text-xs text-muted-foreground">{item.orders} sold</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
