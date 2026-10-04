"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Pencil, Boxes, TriangleAlert, XCircle, ExternalLink } from "lucide-react";
import type { InventoryStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/brand/stat-card";
import { FormDialog, Field, inputClass } from "@/components/brand/form-dialog";
import { updateStockCount } from "@/app/actions/inventory";
import { STOCK_UNITS, validateStockCount, type StockCountedRow } from "@/lib/stock-counted";
import { cn } from "@/lib/utils";

/**
 * Stock-counted items — every menu item whose stockMode is DIRECT, whatever
 * category it sits in. These have no recipe, so nothing derives their stock:
 * somebody counts what is on the shelf and types it, and selling one lowers that
 * number directly.
 *
 * Kept in its own tab rather than mixed into Ingredients because the two are not
 * the same kind of thing. Ingredients carry a unit, a reorder level, an expiry, a
 * supplier and recipe relationships, and they feed Reorder & Alerts, Suppliers
 * and the stock ledger. A counted item has none of that — it is a MenuItem — and
 * folding it into that table would quietly corrupt every one of those numbers.
 *
 * This tab deliberately cannot create or rename an item. A counted item needs a
 * price, a category and a photo, all of which live on the Menu screen; having two
 * places to add one would mean two places to look when something is wrong. Here
 * you only count.
 */

const STATUS_STYLE: Record<InventoryStatus, string> = {
  GOOD: "bg-emerald-50 text-emerald-700",
  LOW: "bg-amber-50 text-amber-700",
  OUT_OF_STOCK: "bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<InventoryStatus, string> = {
  GOOD: "Good",
  LOW: "Low",
  OUT_OF_STOCK: "Out of Stock",
};

/** "3h ago" / "Yesterday" / a date, matching the tone of the other staff tables. */
function whenLabel(iso: string) {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-PH");
}

const EMPTY_FORM = { unitLabel: STOCK_UNITS[0], stockCount: "", lowStockAt: "" };

export function StockCountedItems({
  rows,
  canManage,
}: {
  rows: StockCountedRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // The Menu screen under whichever role is signed in — that's where these items
  // are created, renamed and priced.
  const menuHref = pathname.replace(/\/inventory.*$/, "/menu");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [editing, setEditing] = useState<StockCountedRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Built from the rows themselves, so the filter only ever offers categories
  // that actually hold counted items.
  const categories = [...new Map(rows.map((r) => [r.categoryId, r.categoryName])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1])
  );

  const filtered = rows.filter(
    (r) =>
      (category === "all" || r.categoryId === category) &&
      `${r.name} ${r.categoryName}`.toLowerCase().includes(search.toLowerCase())
  );

  const lowCount = rows.filter((r) => r.status === "LOW").length;
  const outCount = rows.filter((r) => r.status === "OUT_OF_STOCK").length;
  const goodCount = rows.filter((r) => r.status === "GOOD").length;

  function openEdit(row: StockCountedRow) {
    setEditing(row);
    setForm({
      unitLabel: row.unitLabel,
      stockCount: String(row.stockCount),
      lowStockAt: String(row.lowStockAt),
    });
    setError("");
  }

  function submit() {
    if (!editing) return;
    setError("");

    const input = {
      unitLabel: form.unitLabel,
      stockCount: Number(form.stockCount || 0),
      lowStockAt: Number(form.lowStockAt || 0),
    };

    // Same rules the server enforces, checked here so the message lands on the
    // form instead of coming back as a generic save failure.
    const invalid = validateStockCount(input);
    if (invalid) {
      setError(invalid);
      return;
    }

    startTransition(async () => {
      const result = await updateStockCount(editing.id, input);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  // What the open edit would do to the count, previewed under the form — the
  // same affordance the Ingredients tab shows.
  const stockDelta = editing ? Number(form.stockCount || 0) - editing.stockCount : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Items counted" value={String(rows.length)} icon={Boxes} tint="navy" />
        <StatCard label="Well stocked" value={String(goodCount)} icon={Boxes} tint="green" />
        <StatCard
          label="Low stock"
          value={String(lowCount)}
          icon={TriangleAlert}
          tint="amber"
          sub="at or below the set level"
        />
        <StatCard label="Out of stock" value={String(outCount)} icon={XCircle} tint="red" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search counted items…"
              className="w-full rounded-lg border border-border bg-card py-2 pr-3 pl-9 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="all">Any category</option>
            {categories.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <Link
          href={menuHref}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" /> Add or edit on Menu
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} item{rows.length === 1 ? "" : "s"} · these have no
        recipe, so selling one lowers its own count instead of any ingredient.
      </p>

      {error && !editing && <p className="text-sm text-destructive">{error}</p>}

      <Card className="border-0 shadow-sm">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {["Item", "Category", "Stock", "Low-stock level", "Status", "Updated"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
                {canManage && (
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="py-10 text-center text-muted-foreground">
                    {rows.length === 0 ? (
                      <>
                        No counted items yet. On the{" "}
                        <Link href={menuHref} className="font-medium text-primary hover:underline">
                          Menu
                        </Link>{" "}
                        screen, set an item&apos;s stock to &ldquo;Direct stock count&rdquo; and it
                        will show up here.
                      </>
                    ) : (
                      "No item matches that search."
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-6 py-4 font-medium text-foreground">{row.name}</td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {row.categoryName}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-foreground/80">
                      {row.stockCount.toLocaleString()} {row.unitLabel}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {row.lowStockAt.toLocaleString()} {row.unitLabel}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn("rounded-full px-2.5 py-1 text-xs font-bold", STATUS_STYLE[row.status])}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{whenLabel(row.updatedAt)}</td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openEdit(row)}
                          disabled={isPending}
                          className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit count
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <FormDialog
        title={editing ? `Count — ${editing.name}` : "Count"}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        submitLabel="Save count"
        submitting={isPending}
        error={error}
      >
        <Field label="Counted in">
          <select
            value={form.unitLabel}
            onChange={(e) => setForm({ ...form, unitLabel: e.target.value })}
            className={inputClass}
          >
            {STOCK_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={editing ? `Stock (was ${editing.stockCount} ${editing.unitLabel})` : "Stock on hand"}
          hint={
            editing && stockDelta !== 0
              ? `${stockDelta > 0 ? "+" : "−"}${Math.abs(stockDelta)} ${form.unitLabel} — count changed`
              : "Type the actual number on the shelf right now."
          }
        >
          <input
            type="number"
            min={0}
            step={1}
            value={form.stockCount}
            onChange={(e) => setForm({ ...form, stockCount: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Low-stock level" hint="You are warned once the count reaches or falls below this.">
          <input
            type="number"
            min={0}
            step={1}
            value={form.lowStockAt}
            onChange={(e) => setForm({ ...form, lowStockAt: e.target.value })}
            className={inputClass}
          />
        </Field>

        <p className="text-xs text-muted-foreground">
          Name, price and category are edited on the Menu screen — this dialog is the count only.
        </p>
      </FormDialog>
    </div>
  );
}
