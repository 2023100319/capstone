"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, Search, Sparkles, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/brand/stat-card";
import { TablePagination, paginate } from "@/components/brand/table-pagination";
import { cn } from "@/lib/utils";

/**
 * The whole of Menu Health in one table.
 *
 * It used to be four stat cards over three separate lists — a paginated table, a
 * stack of red boxes and a plain table — so the same item could be read three
 * different ways and only one of the lists could be searched. Now there is one
 * table with a Health column, and the stat cards are the filter: clicking
 * "Blocked by stock" narrows the same rows instead of scrolling to a different
 * layout. Search, category and pagination then apply to whatever is showing.
 *
 * Filtering and paging are local state rather than a `?page=` round trip the way
 * the Activity feed does it: every row already arrives with the page.
 */

export type MenuHealthRow = {
  id: string;
  name: string;
  categoryName: string;
  price: number;
  isPromo: boolean;
  isRecommended: boolean;
  /** Straight from menuAvailability() — see src/lib/availability.ts. */
  hasRecipe: boolean;
  tracksStock: boolean;
  unavailable: boolean;
  canMake: number | null;
  blockedBy: string[];
  lowStockAt: number;
  unitLabel: string;
};

type Filter = "all" | "missing" | "blocked" | "featured";
type Health = "blocked" | "missing" | "ok";

const PER_PAGE = 25;

/** Blocked first, then unconfigured, then healthy — open on what needs work. */
const HEALTH_ORDER: Record<Health, number> = { blocked: 0, missing: 1, ok: 2 };

const TITLES: Record<Filter, string> = {
  all: "All menu items",
  missing: "Missing a recipe",
  blocked: "Blocked by stock",
  featured: "Promo & recommended",
};

const peso = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function healthOf(row: MenuHealthRow): Health {
  // Counted-by-hand items are recipe-less on purpose — their stock is typed in
  // Inventory — so being recipe-less is only a gap when nothing tracks them.
  if (row.unavailable) return "blocked";
  if (!row.hasRecipe && !row.tracksStock) return "missing";
  return "ok";
}

/** The words in the Health column, and the tint that carries them. */
function healthBadge(row: MenuHealthRow): { text: string; className: string } {
  switch (healthOf(row)) {
    case "blocked":
      return {
        text: row.tracksStock
          ? `Sold out — 0 ${row.unitLabel} on hand`
          : `Out of: ${row.blockedBy.join(", ")}`,
        className: "bg-red-50 text-red-700",
      };
    case "missing":
      return { text: "No recipe", className: "bg-amber-50 text-amber-700" };
    default: {
      if (!row.tracksStock) {
        return { text: `Can make ${row.canMake}`, className: "bg-emerald-50 text-emerald-700" };
      }
      const onHand = row.canMake ?? 0;
      return onHand <= row.lowStockAt
        ? { text: `Low · ${onHand} ${row.unitLabel}`, className: "bg-amber-50 text-amber-700" }
        : {
            text: `${onHand} ${row.unitLabel} on hand`,
            className: "bg-emerald-50 text-emerald-700",
          };
    }
  }
}

export function MenuHealthTable({ rows }: { rows: MenuHealthRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);

  const counts = useMemo(
    () => ({
      all: rows.length,
      missing: rows.filter((r) => healthOf(r) === "missing").length,
      blocked: rows.filter((r) => healthOf(r) === "blocked").length,
      featured: rows.filter((r) => r.isPromo || r.isRecommended).length,
    }),
    [rows]
  );

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.categoryName))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          HEALTH_ORDER[healthOf(a)] - HEALTH_ORDER[healthOf(b)] || a.name.localeCompare(b.name)
      ),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((r) => {
      if (filter === "featured" && !r.isPromo && !r.isRecommended) return false;
      if (filter !== "all" && filter !== "featured" && healthOf(r) !== filter) return false;
      if (category !== "all" && r.categoryName !== category) return false;
      return q === "" || `${r.name} ${r.categoryName}`.toLowerCase().includes(q);
    });
  }, [sorted, filter, category, search]);

  const { page: current, pageCount, start, visible } = paginate(filtered, page, PER_PAGE);

  const narrowed = search !== "" || category !== "all";

  function pick(next: Filter) {
    // Clicking the active card clears it — the cards read as toggles.
    setFilter((prev) => (prev === next ? "all" : next));
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Live menu items"
          value={String(counts.all)}
          icon={BookOpen}
          tint="blue"
          sub="show everything"
          active={filter === "all"}
          onClick={() => pick("all")}
        />
        <StatCard
          label="Missing a recipe"
          value={String(counts.missing)}
          icon={AlertTriangle}
          tint="amber"
          sub="availability not tracked"
          active={filter === "missing"}
          onClick={() => pick("missing")}
        />
        <StatCard
          label="Blocked by stock"
          value={String(counts.blocked)}
          icon={XCircle}
          tint="red"
          sub="cannot be sold now"
          active={filter === "blocked"}
          onClick={() => pick("blocked")}
        />
        <StatCard
          label="Promo / recommended"
          value={String(counts.featured)}
          icon={Sparkles}
          tint="green"
          sub="featured on the menu"
          active={filter === "featured"}
          onClick={() => pick("featured")}
        />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base font-semibold text-foreground">
            {TITLES[filter]} ({counts[filter]})
          </CardTitle>
          <Link
            href="/staff/admin/menu"
            className="text-sm font-medium text-brand-blue underline-offset-4 transition-colors hover:underline"
          >
            Manage in Menu →
          </Link>
        </CardHeader>

        <CardContent className="space-y-4 p-0">
          <div className="flex flex-wrap items-center gap-3 px-6">
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search items…"
                className="w-full rounded-lg bg-card py-2 pr-4 pl-9 text-sm text-foreground shadow-sm ring-1 ring-border transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            >
              <option value="all">Any category</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {(narrowed || filter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setFilter("all");
                  setPage(1);
                }}
                className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Item", "Category", "Price", "Health", "Tags"].map((h) => (
                    <th key={h} className="px-6 py-3 text-left font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted-foreground">
                      {rows.length === 0
                        ? "There are no live menu items."
                        : "No item matches those filters."}
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => {
                    const badge = healthBadge(row);
                    return (
                      <tr
                        key={row.id}
                        className="border-b transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-6 py-3 font-medium text-foreground">{row.name}</td>
                        <td className="px-6 py-3 text-foreground/80">{row.categoryName}</td>
                        <td className="px-6 py-3 text-foreground/80">{peso(row.price)}</td>
                        <td className="px-6 py-3">
                          <span
                            className={cn(
                              "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                              badge.className
                            )}
                          >
                            {badge.text}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex gap-1.5">
                            {row.isPromo && (
                              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                                Promo
                              </span>
                            )}
                            {row.isRecommended && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
                                Recommended
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={current}
            pageCount={pageCount}
            start={start}
            shown={visible.length}
            total={filtered.length}
            filteredFrom={rows.length}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
