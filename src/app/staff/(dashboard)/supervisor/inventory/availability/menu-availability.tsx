"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, CheckCircle2, HelpCircle, Search, UtensilsCrossed, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/brand/stat-card";
import { TablePagination, paginate } from "@/components/brand/table-pagination";
import { cn } from "@/lib/utils";

/**
 * The whole of Menu Availability in one table.
 *
 * It used to be three stacked sections — red boxes for blocked dishes, loose
 * pills for the ones missing a recipe, and a three-column grid of everything
 * sellable — so the same dish was drawn three different ways and the search box
 * narrowed all three at once without saying so. Now there is one table with a
 * Status column, and the stat cards are the filter: clicking "Blocked" narrows
 * the same rows instead of scrolling to a different layout. Search, category and
 * pagination then apply to whatever is showing.
 *
 * Same shape as Menu Health (src/app/staff/(dashboard)/admin/menu-health) on
 * purpose — the two pages answer neighbouring questions and share the footer.
 */

type Dish = {
  id: string;
  name: string;
  categoryName: string;
  hasRecipe: boolean;
  /** Counted by hand rather than cooked from ingredients. */
  tracksStock: boolean;
  canMake: number | null;
  unavailable: boolean;
  blockedBy: string[];
};

type Filter = "all" | "blocked" | "needsRecipe" | "sellable";
type State = "blocked" | "needsRecipe" | "sellable";

const PER_PAGE = 15;

/** Blocked first, then unconfigured, then healthy — open on what needs work. */
const STATE_ORDER: Record<State, number> = { blocked: 0, needsRecipe: 1, sellable: 2 };

const TITLES: Record<Filter, string> = {
  all: "All dishes",
  blocked: "Blocked — cannot be sold",
  needsRecipe: "Needs a recipe",
  sellable: "Sellable now",
};

/**
 * Two things gate a dish: a recipe, or a hand-typed count. Either one makes it
 * tracked; only a dish with neither is actually missing setup — and that one is
 * never "blocked", because it has nothing to run out of.
 */
function stateOf(d: Dish): State {
  if (!d.hasRecipe && !d.tracksStock) return "needsRecipe";
  return d.unavailable ? "blocked" : "sellable";
}

/** The words in the Status column, and the tint that carries them. */
function statusBadge(d: Dish): { text: string; className: string } {
  switch (stateOf(d)) {
    case "blocked":
      // A counted item has no ingredient to name — it is simply at zero.
      return {
        text: d.tracksStock ? "Sold out — count is 0" : `Out of: ${d.blockedBy.join(", ")}`,
        className: "bg-red-50 text-red-700",
      };
    case "needsRecipe":
      return { text: "No recipe yet", className: "bg-amber-50 text-amber-700" };
    default:
      return { text: "Sellable", className: "bg-emerald-50 text-emerald-700" };
  }
}

/** What decides this dish's availability, said plainly. */
function trackedBy(d: Dish): string {
  if (d.tracksStock) return "Counted by hand";
  if (d.hasRecipe) return "Recipe";
  return "Nothing yet";
}

function remainingLabel(d: Dish): string {
  if (d.canMake === null) return "—";
  return d.tracksStock ? `${d.canMake} on hand` : `${d.canMake} servings`;
}

export function MenuAvailability({ dishes }: { dishes: Dish[] }) {
  const pathname = usePathname();
  // Every role that mounts this page (Supervisor, Owner) has an Inventory screen
  // one segment up, so the back link always resolves.
  const inventoryHref = pathname.replace(/\/availability$/, "");

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);

  const counts = useMemo(
    () => ({
      all: dishes.length,
      blocked: dishes.filter((d) => stateOf(d) === "blocked").length,
      needsRecipe: dishes.filter((d) => stateOf(d) === "needsRecipe").length,
      sellable: dishes.filter((d) => stateOf(d) === "sellable").length,
    }),
    [dishes]
  );

  const categories = useMemo(
    () => [...new Set(dishes.map((d) => d.categoryName))].sort((a, b) => a.localeCompare(b)),
    [dishes]
  );

  const sorted = useMemo(
    () =>
      [...dishes].sort((a, b) => {
        const byState = STATE_ORDER[stateOf(a)] - STATE_ORDER[stateOf(b)];
        if (byState !== 0) return byState;
        // Then the thinnest stock first: this page is read to find what is about
        // to run out, not to look up a name — search does that. Untracked dishes
        // have no number, so they sort last within their group.
        const left = a.canMake ?? Infinity;
        const right = b.canMake ?? Infinity;
        if (left !== right) return left - right;
        return a.name.localeCompare(b.name);
      }),
    [dishes]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((d) => {
      if (filter !== "all" && stateOf(d) !== filter) return false;
      if (category !== "all" && d.categoryName !== category) return false;
      return q === "" || `${d.name} ${d.categoryName}`.toLowerCase().includes(q);
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
      <div>
        <Link
          href={inventoryHref}
          className="mb-1 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Inventory
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Menu Availability</h1>
        <p className="text-sm text-muted-foreground">
          Which dishes can still be sold — from ingredient stock, or from a counted item&apos;s own
          number on hand.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Dishes on the menu"
          value={String(counts.all)}
          icon={UtensilsCrossed}
          tint="blue"
          sub="show everything"
          active={filter === "all"}
          onClick={() => pick("all")}
        />
        <StatCard
          label="Blocked"
          value={String(counts.blocked)}
          icon={XCircle}
          tint="red"
          sub="cannot be sold now"
          active={filter === "blocked"}
          onClick={() => pick("blocked")}
        />
        <StatCard
          label="Needs a recipe"
          value={String(counts.needsRecipe)}
          icon={HelpCircle}
          tint="amber"
          sub="availability not tracked"
          active={filter === "needsRecipe"}
          onClick={() => pick("needsRecipe")}
        />
        <StatCard
          label="Sellable"
          value={String(counts.sellable)}
          icon={CheckCircle2}
          tint="green"
          sub="good to go"
          active={filter === "sellable"}
          onClick={() => pick("sellable")}
        />
      </div>

      <Card className="border-0 shadow-sm">
        {/* Filters sit beside the title, matching the analytics table — the
            band to the right of a short title was empty. They wrap below it
            on a narrow screen. */}
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base font-semibold text-foreground">
            {TITLES[filter]} ({counts[filter]})
          </CardTitle>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search dishes…"
                className="w-full rounded-lg bg-card py-2 pr-4 pl-9 text-sm text-foreground shadow-sm ring-1 ring-border transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50"
              />
            </div>

            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by category"
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
        </CardHeader>

        <CardContent className="space-y-4 p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Dish", "Category", "Tracked by", "Remaining", "Status"].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "px-6 py-3 text-left font-medium text-muted-foreground",
                        h === "Remaining" && "text-right"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted-foreground">
                      {dishes.length === 0
                        ? "There are no live menu items."
                        : "No dish matches those filters."}
                    </td>
                  </tr>
                ) : (
                  visible.map((d) => {
                    const badge = statusBadge(d);
                    return (
                      <tr
                        key={d.id}
                        className="border-b transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-6 py-3 font-medium text-foreground">{d.name}</td>
                        <td className="px-6 py-3 text-foreground/80">{d.categoryName}</td>
                        <td className="px-6 py-3 text-muted-foreground">{trackedBy(d)}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-foreground/80">
                          {remainingLabel(d)}
                        </td>
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
            filteredFrom={dishes.length}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
