"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft, Printer, Download, TrendingDown, Trash2, PackagePlus, SlidersHorizontal, Search, Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TablePagination, paginate } from "@/components/brand/table-pagination";
import type {
  FamilySeries, IngredientMovementRow, MovementAnalytics, SeriesPoint, TopRow,
} from "@/app/actions/inventory-reports";
import { familyUnit, formatFamilyQty, formatQty, headlineByUnit, summarizeByUnit } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * Inventory Reports & Analytics.
 *
 * The numbers here used to be bare cross-unit sums — "Consumed 1,240" over
 * ingredients measured in g, kg, ml, L and pcs at once, which is 1,240 of
 * nothing — and no ingredient was ever named outside two top-six lists. So
 * every total is now printed per unit family (see src/lib/units.ts), and the
 * cards filter one ingredient-by-ingredient table underneath: the same
 * card-as-filter shape as Menu Health and Menu Availability.
 *
 * Where a card's figure comes from is explained on hover rather than in prose
 * above the grid. The client read that paragraph as clutter, and an explanation
 * attached to the card it explains is the one place it can't be missed.
 */

const PERIODS = [7, 30, 90];
const PER_PAGE = 15;

type Metric = "consumed" | "loss" | "restocked" | "adjusted";
type Filter = "all" | Metric;

/** What each card measures, and how a row contributes to it. */
const METRIC_VALUE: Record<Metric, (row: IngredientMovementRow) => number> = {
  consumed: (r) => r.consumed,
  loss: (r) => r.wasted + r.expired,
  restocked: (r) => r.restocked,
  adjusted: (r) => r.adjustedNet,
};

const TABLE_TITLE: Record<Filter, string> = {
  all: "Every ingredient that moved",
  consumed: "Used up by sales imports",
  loss: "Lost to wastage & expiry",
  restocked: "Restocked from deliveries",
  adjusted: "Corrected by hand",
};

type Column = { key: string; label: string; numeric: boolean };

const COLUMNS: Column[] = [
  { key: "name", label: "Ingredient", numeric: false },
  { key: "categoryName", label: "Category", numeric: false },
  { key: "consumed", label: "Used", numeric: true },
  { key: "loss", label: "Lost", numeric: true },
  { key: "restocked", label: "Restocked", numeric: true },
  { key: "adjusted", label: "Correction", numeric: true },
  { key: "onHand", label: "On hand now", numeric: true },
];

function num(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** A quantity cell — zero reads as a dash so the eye finds what actually moved. */
function qtyCell(qty: number, unit: string, signed = false) {
  if (!qty) return "—";
  const sign = signed && qty > 0 ? "+" : "";
  return `${sign}${formatQty(qty, unit)}`;
}

/**
 * The one thing every card shares and none of them can show on its face: this
 * report is the ingredient ledger, so counted goods never appear in it.
 */
const SCOPE_NOTE =
  "Ingredients only — hand-counted items such as bread and donuts are counted on the Inventory page.";

/**
 * A KPI card that filters the table and explains itself.
 *
 * The explanation used to be a paragraph above the grid; it is a hover panel now
 * so the page carries no prose until someone asks. Hover alone would strand
 * phone users, hence the ⓘ button — which is why the card is a wrapper div with
 * two sibling buttons rather than one button: a <button> may not contain another.
 */
function MetricCard({
  label,
  value,
  rest,
  sub,
  what,
  how,
  icon: Icon,
  tint,
  active,
  onClick,
}: {
  label: string;
  value: string;
  rest?: string;
  sub: string;
  /** One sentence: what this number is. */
  what: string;
  /** One sentence: which entries it adds up, and how. */
  how: string;
  icon: LucideIcon;
  tint: string;
  active: boolean;
  onClick: () => void;
}) {
  const [pinned, setPinned] = useState(false);
  const panelId = `metric-${label.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <div className="group relative h-full">
      {/* h-full twice on purpose: the grid stretches this wrapper, and without
          it the button inside would still size to its own text — which is what
          left the four cards ragged. */}
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-describedby={panelId}
        className={cn(
          "flex h-full w-full items-start gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-brand-navy/40 hover:bg-muted/40",
          active && "border-brand-navy ring-2 ring-brand-navy/20"
        )}
      >
        <div className={cn("flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl", tint)}>
          <Icon className="h-6 w-6" />
        </div>
        {/* Every card prints the same four rows — the second unit line is held
            open when there isn't one, and the caption is clamped — so the text
            of all four lines up instead of drifting by however long it ran. */}
        <div className="min-w-0 pr-5">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-bold text-foreground">{value}</p>
          <p className="truncate text-sm font-medium text-foreground/70">{rest || " "}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{sub}</p>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setPinned((open) => !open)}
        aria-label={`What "${label}" counts`}
        aria-expanded={pinned}
        aria-controls={panelId}
        className="absolute top-3 right-3 z-10 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground print:hidden"
      >
        <Info className="h-4 w-4" />
      </button>

      <div
        id={panelId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-full right-0 left-0 z-30 mt-2 rounded-xl border border-border bg-card p-3 text-xs shadow-lg transition-opacity",
          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 print:hidden",
          pinned && "opacity-100"
        )}
      >
        <p className="font-medium text-foreground">{what}</p>
        <p className="mt-1.5 text-muted-foreground">
          <span className="font-semibold text-foreground/70">How: </span>
          {how}
        </p>
        <p className="mt-1.5 text-[11px] text-muted-foreground/80">{SCOPE_NOTE}</p>
      </div>
    </div>
  );
}

/**
 * A compact column chart. Everything it plots is already in one family's base
 * unit, so the axis can name a real unit instead of leaving the reader to guess.
 */
function BarChart({
  series,
  family,
  keys,
}: {
  series: SeriesPoint[];
  family: string;
  keys: { key: keyof SeriesPoint; color: string; label: string }[];
}) {
  const max = Math.max(
    1,
    ...series.map((p) => keys.reduce((sum, k) => sum + (p[k.key] as number), 0))
  );
  const unit = familyUnit(family, max);

  return (
    <div>
      <div className="flex gap-2">
        {/* y-axis: the top of the chart, in words. */}
        <div
          className="flex w-14 flex-shrink-0 flex-col justify-between text-right text-[10px] text-muted-foreground"
          style={{ height: 140 }}
        >
          <span>{formatFamilyQty(max, family)}</span>
          <span>0</span>
        </div>
        <div className="flex flex-1 items-end gap-1 border-b border-l border-border pl-1" style={{ height: 140 }}>
          {series.map((p, i) => {
            const total = keys.reduce((sum, k) => sum + (p[k.key] as number), 0);
            return (
              <div
                key={i}
                className="flex flex-1 flex-col justify-end"
                title={`${p.label}: ${formatFamilyQty(total, family)}`}
              >
                {keys.map((k) => {
                  const v = p[k.key] as number;
                  if (v <= 0) return null;
                  return (
                    <div
                      key={String(k.key)}
                      className={k.color}
                      style={{ height: `${(v / max) * 130}px` }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Sparse labels so a 30-bar axis stays legible. */}
      <div className="mt-1 flex gap-1 pl-16 text-[10px] text-muted-foreground">
        {series.map((p, i) => (
          <span key={i} className="flex-1 text-center">
            {i === 0 || i === series.length - 1 || i === Math.floor(series.length / 2) ? p.label : ""}
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-3 pl-16">
        {keys.map((k) => (
          <span key={String(k.key)} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("h-2.5 w-2.5 rounded-sm", k.color)} /> {k.label}
          </span>
        ))}
        <span className="text-xs text-muted-foreground">· measured in {unit}</span>
      </div>
    </div>
  );
}

function TopList({ rows, empty }: { rows: TopRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.qty));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-3">
          <span className="w-32 flex-shrink-0 truncate text-right text-sm text-foreground/80">{r.name}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-lg bg-muted">
            <div className="h-full rounded-lg bg-brand-blue/70" style={{ width: `${(r.qty / max) * 100}%` }} />
          </div>
          <span className="w-24 text-right text-sm text-muted-foreground">
            {num(r.qty)} {r.unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The tallest bar in a series — what decides whether the axis reads g or kg. */
function peakOf(points: SeriesPoint[]) {
  return Math.max(1, ...points.map((p) => p.consumed + p.loss + p.restocked));
}

/** The unit families the charts can be switched between. */
function FamilyToggle({
  families,
  active,
  onPick,
}: {
  families: FamilySeries[];
  active: string;
  onPick: (family: string) => void;
}) {
  if (families.length < 2) return null;
  return (
    <div className="flex gap-1 rounded-lg bg-secondary p-1">
      {families.map((f) => (
        <button
          key={f.family}
          type="button"
          onClick={() => onPick(f.family)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            f.family === active
              ? "bg-brand-navy text-white"
              : "text-secondary-foreground hover:text-foreground"
          )}
        >
          {familyUnit(f.family, peakOf(f.points))}
        </button>
      ))}
    </div>
  );
}

export function InventoryReport({ analytics }: { analytics: MovementAnalytics }) {
  const pathname = usePathname();
  // Every role that mounts this page has an Inventory screen one segment up, so
  // the back link always resolves.
  const inventoryHref = pathname.replace(/\/(analytics|reports)$/, "");
  const { days, byIngredient, seriesByFamily } = analytics;

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [family, setFamily] = useState(seriesByFamily[0]?.family ?? "mass");

  const categories = useMemo(
    () => [...new Set(byIngredient.map((r) => r.categoryName))].sort((a, b) => a.localeCompare(b)),
    [byIngredient]
  );

  /** Per-unit totals for the cards — never a single cross-unit number. */
  const cards = useMemo(() => {
    const qty = (metric: Metric) =>
      byIngredient.map((r) => ({ qty: Math.abs(METRIC_VALUE[metric](r)), unit: r.unit }));
    const affected = (metric: Metric) =>
      byIngredient.filter((r) => METRIC_VALUE[metric](r) !== 0);
    const movementsIn = (metric: Metric) =>
      affected(metric).reduce((sum, r) => sum + r.movements, 0);

    return { qty, affected, movementsIn };
  }, [byIngredient]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = byIngredient.filter((r) => {
      if (filter !== "all" && METRIC_VALUE[filter](r) === 0) return false;
      if (category !== "all" && r.categoryName !== category) return false;
      return q === "" || `${r.name} ${r.categoryName}`.toLowerCase().includes(q);
    });

    // Sorted by whatever the active card measures, so the filter and the order
    // always agree; unfiltered, the busiest ingredient leads.
    const weight = (r: IngredientMovementRow) =>
      filter === "all"
        ? r.consumed + r.wasted + r.expired + r.restocked + Math.abs(r.adjustedNet)
        : Math.abs(METRIC_VALUE[filter](r));

    return [...matched].sort((a, b) => weight(b) - weight(a) || a.name.localeCompare(b.name));
  }, [byIngredient, filter, category, search]);

  const { page: current, pageCount, start, visible } = paginate(rows, page, PER_PAGE);
  const narrowed = search !== "" || category !== "all";
  const activeSeries = seriesByFamily.find((f) => f.family === family) ?? seriesByFamily[0];

  function pick(next: Filter) {
    // Clicking the active card clears it — the cards read as toggles.
    setFilter((prev) => (prev === next ? "all" : next));
    setPage(1);
  }

  const consumed = headlineByUnit(cards.qty("consumed"), "Nothing");
  const loss = headlineByUnit(cards.qty("loss"), "Nothing");
  const restocked = headlineByUnit(cards.qty("restocked"), "Nothing");
  const adjusted = headlineByUnit(cards.qty("adjusted"), "None");

  // The loss card splits its own figure, so the reader knows which half to chase.
  const wasted = summarizeByUnit(byIngredient.map((r) => ({ qty: r.wasted, unit: r.unit })), "none");
  const expired = summarizeByUnit(byIngredient.map((r) => ({ qty: r.expired, unit: r.unit })), "none");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={inventoryHref}
            className="mb-1 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Inventory
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Inventory Reports &amp; Analytics</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={`${pathname}?days=${p}`}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  days === p ? "bg-brand-navy text-white" : "text-secondary-foreground hover:text-foreground"
                )}
              >
                {p}d
              </Link>
            ))}
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <a
            href={`/api/inventory/report?days=${days}`}
            className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
          >
            <Download className="h-4 w-4" /> Download .xlsx
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Used up by sales imports"
          value={consumed.value}
          rest={consumed.rest}
          sub={`${cards.affected("consumed").length} ingredients · ${cards.movementsIn("consumed")} deductions`}
          what="Ingredient stock that selling took out."
          how={`adds every deduction the Sales Import made in the last ${days} days — one dish sold subtracts the amounts in its recipe. Totals are split per unit (kg, L, pcs) because ingredients are not all measured the same way.`}
          icon={TrendingDown}
          tint="bg-blue-50 text-brand-blue"
          active={filter === "consumed"}
          onClick={() => pick("consumed")}
        />
        <MetricCard
          label="Lost to wastage & expiry"
          value={loss.value}
          rest={loss.rest}
          sub={`wasted ${wasted} · expired ${expired}`}
          what="Stock written off instead of sold — spoiled, damaged, or past its date."
          how={`adds every Wastage you recorded plus every ingredient you marked expired (which zeroes its stock). Wasted ${wasted}; expired ${expired}.`}
          icon={Trash2}
          tint="bg-red-50 text-red-600"
          active={filter === "loss"}
          onClick={() => pick("loss")}
        />
        <MetricCard
          label="Restocked from deliveries"
          value={restocked.value}
          rest={restocked.rest}
          sub={`${cards.affected("restocked").length} ingredients received stock`}
          what="Stock that came in from suppliers."
          how="adds every stock-in: raising an ingredient's stock on its Edit form, and the opening stock typed when a new ingredient is created."
          icon={PackagePlus}
          tint="bg-emerald-50 text-emerald-600"
          active={filter === "restocked"}
          onClick={() => pick("restocked")}
        />
        <MetricCard
          label="Corrected by hand"
          value={adjusted.value}
          rest={adjusted.rest}
          sub={`${cards.affected("adjusted").length} ingredients edited to a new count`}
          what="How far counts were moved by hand — recounts and corrections, not sales or deliveries."
          how="nets each ingredient's manual edits first, then adds those net changes by size, ignoring whether they went up or down. The table's Correction column keeps the + or −."
          icon={SlidersHorizontal}
          tint="bg-amber-50 text-amber-600"
          active={filter === "adjusted"}
          onClick={() => pick("adjusted")}
        />
      </div>

      {/* The ingredient-by-ingredient answer the cards only summarise. */}
      <Card className="border-0 shadow-sm">
        {/* Filters ride beside the title rather than on a strip of their own —
            the space to the right of a short title was going to waste. They
            wrap underneath it on a narrow screen. */}
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base font-semibold text-foreground">
            {TABLE_TITLE[filter]} ({rows.length})
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
                placeholder="Search ingredients…"
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
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={cn(
                        "px-6 py-3 text-left font-medium whitespace-nowrap text-muted-foreground",
                        c.numeric && "text-right"
                      )}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="py-10 text-center text-muted-foreground">
                      {byIngredient.length === 0
                        ? "No stock moved in this period."
                        : "No ingredient matches those filters."}
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => (
                    <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-6 py-3 font-medium whitespace-nowrap text-foreground">{r.name}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-foreground/80">{r.categoryName}</td>
                      <td className="px-6 py-3 text-right whitespace-nowrap tabular-nums text-foreground/80">
                        {qtyCell(r.consumed, r.unit)}
                      </td>
                      <td
                        className={cn(
                          "px-6 py-3 text-right whitespace-nowrap tabular-nums",
                          r.wasted + r.expired > 0 ? "font-medium text-red-600" : "text-foreground/80"
                        )}
                      >
                        {qtyCell(r.wasted + r.expired, r.unit)}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap tabular-nums text-foreground/80">
                        {qtyCell(r.restocked, r.unit)}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap tabular-nums text-foreground/80">
                        {qtyCell(r.adjustedNet, r.unit, true)}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap tabular-nums font-medium text-foreground">
                        {formatQty(r.onHand, r.unit)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={current}
            pageCount={pageCount}
            start={start}
            shown={visible.length}
            total={rows.length}
            filteredFrom={byIngredient.length}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      {activeSeries && (
        <div className="space-y-4">
          {/* One toggle for both charts — they plot the same family, so keeping
              them in step is the only reading that makes sense. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">Daily trend</h2>
              <p className="text-xs text-muted-foreground">
                Ingredients measured in {familyUnit(activeSeries.family, peakOf(activeSeries.points))}
                {seriesByFamily.length > 1 && " — switch units on the right"}
              </p>
            </div>
            <FamilyToggle families={seriesByFamily} active={activeSeries.family} onPick={setFamily} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground">
                  What left the store
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  series={activeSeries.points}
                  family={activeSeries.family}
                  keys={[
                    { key: "consumed", color: "bg-brand-blue/70", label: "Sold" },
                    { key: "loss", color: "bg-red-500/70", label: "Wasted or expired" },
                  ]}
                />
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-foreground">What came in</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  series={activeSeries.points}
                  family={activeSeries.family}
                  keys={[{ key: "restocked", color: "bg-emerald-500/70", label: "Delivered" }]}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground">
              Biggest sellers by ingredient
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopList rows={analytics.topConsumed} empty="No consumption recorded in this period." />
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground">
              Biggest losses (wastage + expiry)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopList rows={analytics.topWasted} empty="No wastage or expiry recorded in this period." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
