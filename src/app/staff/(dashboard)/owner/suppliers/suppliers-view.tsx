"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Truck, PackageCheck, Boxes, CalendarClock, Search, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/brand/stat-card";
import type { SupplierRow } from "@/app/actions/inventory-reports";
import { ANALYTICS_PERIODS } from "@/lib/analytics-period";
import { cn } from "@/lib/utils";

type Sort = "deliveries" | "recent" | "name";

const SORT_LABEL: Record<Sort, string> = {
  deliveries: "Most deliveries",
  recent: "Recently delivered",
  name: "Name (A–Z)",
};

/** How many ingredient rows show before the card needs expanding. */
const COLLAPSED_ITEMS = 5;

/** Matches the chips used across the inventory screens. */
const STATUS_CHIP: Record<string, string> = {
  GOOD: "bg-muted text-muted-foreground",
  LOW: "bg-amber-50 text-amber-700",
  OUT_OF_STOCK: "bg-red-50 text-red-700",
};

const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "today" / "3 days ago" — friendlier than a bare date on the headline tile. */
function relativeDays(iso: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.round((startOfToday.getTime() - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function SuppliersView({ suppliers, days }: { suppliers: SupplierRow[]; days: number }) {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("deliveries");
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? suppliers.filter(
          (s) =>
            s.supplier.toLowerCase().includes(q) ||
            s.items.some((i) => i.name.toLowerCase().includes(q))
        )
      : suppliers;

    return [...matched].sort((a, b) => {
      if (sort === "name") return a.supplier.localeCompare(b.supplier);
      // Never-delivered suppliers have no date to compare, so they sort last.
      if (sort === "recent") return (b.lastDelivery ?? "").localeCompare(a.lastDelivery ?? "");
      return b.deliveries - a.deliveries;
    });
  }, [suppliers, search, sort]);

  const totalDeliveries = suppliers.reduce((sum, s) => sum + s.deliveries, 0);
  const mostActive = [...suppliers].sort((a, b) => b.deliveries - a.deliveries)[0];
  // A supplier can be listed without ever having delivered, so the headline
  // tile only considers the ones that have.
  const latest = suppliers
    .filter((s) => s.lastDelivery !== null)
    .sort((a, b) => (b.lastDelivery as string).localeCompare(a.lastDelivery as string))[0];
  const awaitingFirst = suppliers.filter((s) => s.deliveries === 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Suppliers</h1>
        <p className="text-sm text-muted-foreground">
          Who the store restocks from — every supplier named on an ingredient, with the deliveries
          recorded against it. Read-only.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Suppliers"
          value={String(suppliers.length)}
          icon={Truck}
          tint="navy"
          sub={awaitingFirst > 0 ? `${awaitingFirst} awaiting a first delivery` : undefined}
        />
        <StatCard
          label="Deliveries"
          value={String(totalDeliveries)}
          icon={PackageCheck}
          tint="green"
          sub={days ? `in the last ${days} days` : "all time"}
        />
        <StatCard
          label="Most active"
          value={mostActive?.deliveries ? mostActive.supplier : "—"}
          icon={Boxes}
          tint="blue"
          sub={mostActive?.deliveries ? `${mostActive.deliveries} deliveries` : undefined}
        />
        <StatCard
          label="Last delivery"
          value={latest ? relativeDays(latest.lastDelivery as string) : "—"}
          icon={CalendarClock}
          tint="amber"
          sub={latest?.supplier}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier or ingredient..."
            className="w-full rounded-lg bg-card py-2 pr-4 pl-9 text-sm text-foreground shadow-sm ring-1 ring-border transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50 sm:w-72"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>

        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          <Link
            href={pathname}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              days === 0
                ? "bg-brand-navy text-white"
                : "text-secondary-foreground hover:text-foreground"
            )}
          >
            All
          </Link>
          {ANALYTICS_PERIODS.map((p) => (
            <Link
              key={p}
              href={`${pathname}?days=${p}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                days === p
                  ? "bg-brand-navy text-white"
                  : "text-secondary-foreground hover:text-foreground"
              )}
            >
              {p}d
            </Link>
          ))}
        </div>

        {search && (
          <button
            onClick={() => setSearch("")}
            className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <Truck className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium text-foreground">
              {suppliers.length === 0 ? "No suppliers yet" : "No supplier matches that search"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {suppliers.length === 0
                ? "A supplier appears here as soon as an ingredient on the Inventory page names one — a delivery is not needed first."
                : "Try a different name, or clear the search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((s) => {
            const open = expanded === s.supplier;
            const shown = open ? s.items : s.items.slice(0, COLLAPSED_ITEMS);
            const hidden = s.items.length - shown.length;

            return (
              <Card key={s.supplier} className="overflow-hidden border-0 shadow-sm">
                <div className="flex items-start gap-3 border-b border-border bg-muted/30 px-5 py-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-navy text-white">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{s.supplier}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.lastDelivery
                        ? `Last delivery ${fmtDate(s.lastDelivery)}`
                        : days
                          ? "No delivery in this period"
                          : "No deliveries recorded yet"}{" "}
                      · {s.ingredientCount} ingredient{s.ingredientCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                      s.deliveries === 0
                        ? "bg-muted text-muted-foreground"
                        : "bg-brand-blue/10 text-brand-blue"
                    )}
                  >
                    {s.deliveries === 0
                      ? "Awaiting first delivery"
                      : `${s.deliveries} deliver${s.deliveries === 1 ? "y" : "ies"}`}
                  </span>
                </div>

                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {shown.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
                        {/* Delivered quantity when there is one, otherwise what
                            is on hand — an ingredient with no delivery in the
                            window would otherwise read a bare "0". */}
                        <span
                          className={cn(
                            "flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                            item.quantity > 0
                              ? "bg-muted text-muted-foreground"
                              : STATUS_CHIP[item.status]
                          )}
                        >
                          {item.quantity > 0
                            ? `${num(item.quantity)} ${item.unit} delivered`
                            : `${num(item.onHand)} ${item.unit} on hand`}
                        </span>
                      </div>
                    ))}
                  </div>

                  {(hidden > 0 || open) && (
                    <button
                      onClick={() => setExpanded(open ? null : s.supplier)}
                      className="flex w-full items-center justify-center gap-1 border-t border-border py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      {open ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" /> Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" /> Show all {s.items.length} ingredients
                        </>
                      )}
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
