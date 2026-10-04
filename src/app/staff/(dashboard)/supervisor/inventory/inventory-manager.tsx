"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search, Plus, Tag, Pencil, Archive, ArchiveRestore, Upload, ClipboardList, X,
} from "lucide-react";
import type { InventoryStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { FormDialog, Field, inputClass } from "@/components/brand/form-dialog";
import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import {
  createInventoryCategory,
  createInventoryItem,
  updateInventoryItem,
  setInventoryItemArchived,
  setInventoryCategoryArchived,
} from "@/app/actions/inventory";
import { RecipeManager, type RecipeRow } from "./recipe-manager";
import { StockCountedItems } from "./stock-counted-items";
import type { StockCountedRow } from "@/lib/stock-counted";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  ingredientName: string;
  categoryId: string;
  categoryName: string;
  stockQuantity: number;
  unit: string;
  reorderLevel: number;
  supplier: string;
  expiryDate: string;
  status: InventoryStatus;
  updatedBy: string;
};

/** Which prep area a category stocks — the Bar/Kitchen split (2026-09-13). */
type Station = "BAR" | "KITCHEN";

type StationFilter = "all" | Station;

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

const EMPTY_ITEM = {
  ingredientName: "",
  categoryId: "",
  stockQuantity: "",
  unit: "",
  reorderLevel: "",
  supplier: "",
  expiryDate: "",
};

/** Common measures the store buys in, plus an escape hatch for anything else. */
const UNIT_PRESETS = ["pcs", "kg", "g", "L", "ml", "pack", "bottle", "can", "box"];
const REORDER_PRESETS = ["5", "10", "20", "50", "100"];
const CUSTOM = "__custom__";

type StatusFilter = "all" | InventoryStatus;
type ExpiryFilter = "all" | "soon" | "expired" | "none";

const EXPIRY_LABEL: Record<ExpiryFilter, string> = {
  all: "Any expiry",
  soon: "Expiring in 7 days",
  expired: "Expired",
  none: "No expiry set",
};

/** Days between today and a YYYY-MM-DD expiry string; null when unset. */
function daysUntil(expiryDate: string) {
  if (!expiryDate) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${expiryDate}T00:00:00`).getTime() - startOfToday.getTime()) / 86_400_000);
}

export function InventoryManager({
  items,
  ingredients,
  categories,
  recipes,
  counted,
  canManage,
  showArchived,
}: {
  /** What the table shows — live ingredients, or the archived ones. */
  items: Item[];
  /** Always the live ingredients: the Recipes tab picks from these. */
  ingredients: Item[];
  categories: { id: string; name: string; station: Station }[];
  recipes: RecipeRow[];
  /** Finished goods counted by hand — no recipe, they deduct their own number. */
  counted: StockCountedRow[];
  canManage: boolean;
  showArchived: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<"ingredients" | "recipes" | "counted">("ingredients");
  const [activeCategory, setActiveCategory] = useState("all");
  const [stationFilter, setStationFilter] = useState<StationFilter>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [itemDialog, setItemDialog] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [categoryName, setCategoryName] = useState("");
  // Where a newly added category lives — the Bar/Kitchen split.
  const [categoryStation, setCategoryStation] = useState<Station>("KITCHEN");
  // Whether Unit / Reorder level are in "Others…" free-input mode.
  const [unitCustom, setUnitCustom] = useState(false);
  const [reorderCustom, setReorderCustom] = useState(false);
  const [archivingCategory, setArchivingCategory] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Category id → station, so the area filter can ride on the ingredient's
  // category without a per-item station column.
  const stationByCategory = new Map(categories.map((c) => [c.id, c.station]));

  const filtered = items.filter((i) => {
    if (activeCategory !== "all" && i.categoryId !== activeCategory) return false;
    if (stationFilter !== "all" && stationByCategory.get(i.categoryId) !== stationFilter)
      return false;
    if (!i.ingredientName.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && i.status !== statusFilter) return false;

    if (expiryFilter !== "all") {
      const left = daysUntil(i.expiryDate);
      if (expiryFilter === "none" && left !== null) return false;
      if (expiryFilter === "expired" && (left === null || left >= 0)) return false;
      if (expiryFilter === "soon" && (left === null || left < 0 || left > 7)) return false;
    }
    return true;
  });

  const filtersActive =
    statusFilter !== "all" || expiryFilter !== "all" || search !== "" || stationFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setExpiryFilter("all");
    setStationFilter("all");
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_ITEM, categoryId: categories[0]?.id ?? "" });
    setUnitCustom(false);
    setReorderCustom(false);
    setError("");
    setItemDialog(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    setForm({
      ingredientName: item.ingredientName,
      categoryId: item.categoryId,
      stockQuantity: String(item.stockQuantity),
      unit: item.unit,
      reorderLevel: String(item.reorderLevel),
      supplier: item.supplier,
      expiryDate: item.expiryDate,
    });
    // Pre-select "Others…" when the saved value isn't one of the presets.
    setUnitCustom(!!item.unit && !UNIT_PRESETS.includes(item.unit));
    setReorderCustom(!REORDER_PRESETS.includes(String(item.reorderLevel)));
    setError("");
    setItemDialog(true);
  }

  function submitItem() {
    setError("");
    const payload = {
      ingredientName: form.ingredientName,
      categoryId: form.categoryId,
      stockQuantity: Number(form.stockQuantity),
      unit: form.unit,
      reorderLevel: Number(form.reorderLevel || 0),
      supplier: form.supplier,
      expiryDate: form.expiryDate,
    };

    startTransition(async () => {
      const result = editing
        ? await updateInventoryItem(editing.id, payload)
        : await createInventoryItem(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setItemDialog(false);
      router.refresh();
    });
  }

  function submitCategory() {
    setError("");
    startTransition(async () => {
      const result = await createInventoryCategory({
        name: categoryName,
        station: categoryStation,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setCategoryDialog(false);
      setCategoryName("");
      router.refresh();
    });
  }

  /**
   * Archiving is refused server-side while the ingredient is still part of a
   * recipe, so the message that comes back is what the owner acts on.
   */
  function toggleArchive(item: Item) {
    setError("");
    startTransition(async () => {
      const result = await setInventoryItemArchived(item.id, !showArchived);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function confirmArchiveCategory() {
    if (!archivingCategory) return;
    setError("");
    startTransition(async () => {
      const result = await setInventoryCategoryArchived(archivingCategory.id, true);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (activeCategory === archivingCategory.id) setActiveCategory("all");
      setArchivingCategory(null);
      router.refresh();
    });
  }

  /** Restoring puts nothing back into service on its own, so it needs no confirm. */
  function restoreCategory(id: string) {
    setError("");
    startTransition(async () => {
      const result = await setInventoryCategoryArchived(id, false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // Items whose ingredients have run out — the number the supervisor acts on.
  const blockedItems = recipes.filter((r) => r.hasRecipe && r.unavailable).length;

  // Counted items needing a restock, surfaced on the tab so it's visible from
  // the Ingredients view.
  const lowCounted = counted.filter((c) => c.status !== "GOOD").length;

  // What the open edit would do to the stock, previewed under the form.
  const stockDelta = editing ? Number(form.stockQuantity || 0) - editing.stockQuantity : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Inventory Monitoring</h1>

      <div className="flex gap-1 border-b border-border">
        {([
          { id: "ingredients", label: `Ingredients (${items.length})` },
          {
            id: "recipes",
            label: blockedItems > 0 ? `Recipes · ${blockedItems} blocked` : "Recipes",
          },
          {
            id: "counted",
            label:
              lowCounted > 0
                ? `Stock-Counted Items · ${lowCounted} low`
                : `Stock-Counted Items (${counted.length})`,
          },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-brand-navy text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
              t.id === "recipes" && blockedItems > 0 && tab !== t.id && "text-red-600",
              t.id === "counted" && lowCounted > 0 && tab !== t.id && "text-amber-600"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "recipes" ? (
        <RecipeManager recipes={recipes} ingredients={ingredients} canManage={canManage} />
      ) : tab === "counted" ? (
        <StockCountedItems rows={counted} canManage={canManage} />
      ) : (
      <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ingredients..."
              className="w-full rounded-lg bg-card py-2 pr-4 pl-9 text-sm text-foreground shadow-sm ring-1 ring-border transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50 sm:w-56"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="all">Any status</option>
            {(Object.keys(STATUS_LABEL) as InventoryStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value as StationFilter)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="all">Bar &amp; Kitchen</option>
            <option value="BAR">Bar only</option>
            <option value="KITCHEN">Kitchen only</option>
          </select>

          <select
            value={expiryFilter}
            onChange={(e) => setExpiryFilter(e.target.value as ExpiryFilter)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            {(Object.keys(EXPIRY_LABEL) as ExpiryFilter[]).map((f) => (
              <option key={f} value={f}>
                {EXPIRY_LABEL[f]}
              </option>
            ))}
          </select>

          {canManage && (
            <>
              <button
                onClick={() => {
                  setError("");
                  setCategoryDialog(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
              >
                <Tag className="h-4 w-4" /> Add Category
              </button>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-brand-blue-dark active:scale-[.98]"
              >
                <Plus className="h-4 w-4" /> Add Ingredient
              </button>
              <Link
                href={`${pathname}/import`}
                className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
              >
                <Upload className="h-4 w-4" /> Import Sales
              </Link>
            </>
          )}
          {/* Views — available to Supervisor and (read-only) Owner alike. */}
          <Link
            href={`${pathname}/alerts`}
            className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
          >
            <ClipboardList className="h-4 w-4" /> Reorder &amp; Alerts
          </Link>
          <Link
            href={showArchived ? pathname : `${pathname}?archived=1`}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              showArchived
                ? "bg-brand-navy text-white"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            )}
          >
            <Archive className="h-4 w-4" />
            {showArchived ? "Viewing Archived" : "Archived"}
          </Link>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {([{ id: "all", name: "All", station: undefined }, ...categories] as {
          id: string;
          name: string;
          station: Station | undefined;
        }[]).map((cat) => {
          const station = cat.id === "all" ? null : cat.station;
          return (
            <div
              key={cat.id}
              className={cn(
                "flex items-center rounded-xl border shadow-sm transition-all",
                activeCategory === cat.id
                  ? "border-brand-navy bg-brand-navy text-white"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40"
              )}
            >
              <button
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  activeCategory === cat.id ? "" : "hover:text-foreground"
                )}
              >
                {cat.name}
                {/* The prep area tag, so a category is never mistaken for the
                    other side of the split. */}
                {station && (
                  <span
                    className={cn(
                      "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                      activeCategory === cat.id
                        ? "bg-white/20 text-white"
                        : station === "BAR"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                    )}
                  >
                    {station === "BAR" ? "Bar" : "Kitchen"}
                  </span>
                )}
              </button>
              {canManage && cat.id !== "all" && (
                <>
                  <span
                    className={cn(
                      "h-5 w-px",
                      activeCategory === cat.id ? "bg-white/30" : "bg-border"
                    )}
                  />
                  {showArchived ? (
                    <button
                      onClick={() => restoreCategory(cat.id)}
                      aria-label={`Restore ${cat.name} category`}
                      disabled={isPending}
                      className={cn(
                        "flex items-center px-2.5 py-2 transition-colors disabled:opacity-50",
                        activeCategory === cat.id
                          ? "text-white/80 hover:text-white"
                          : "text-muted-foreground hover:text-emerald-600"
                      )}
                    >
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setError("");
                        setArchivingCategory({ id: cat.id, name: cat.name });
                      }}
                      aria-label={`Archive ${cat.name} category`}
                      disabled={isPending}
                      className={cn(
                        "flex items-center px-2.5 py-2 transition-colors disabled:opacity-50",
                        activeCategory === cat.id
                          ? "text-white/80 hover:text-white"
                          : "text-muted-foreground hover:text-brand-navy"
                      )}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Result count — so a filter that hides everything is never mistaken for
          an empty inventory. */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {items.length} ingredient{items.length === 1 ? "" : "s"}
        </p>
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}
      </div>

      {error && !itemDialog && !categoryDialog && !archivingCategory && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Card className="border-0 shadow-sm">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {["Ingredient", "Category", "Stock", "Supplier", "Expiry", "Status", "Updated by"].map((h) => (
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
                  <td colSpan={8} className="py-10 text-center text-muted-foreground">
                    {filtersActive
                      ? "No ingredients match those filters."
                      : showArchived
                        ? "No archived ingredients."
                        : "No ingredients found."}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-6 py-4 font-medium text-foreground">{item.ingredientName}</td>
                    <td className="px-6 py-4">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {item.categoryName}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-foreground/80">
                      {item.stockQuantity.toLocaleString()} {item.unit}
                    </td>
                    <td className="px-6 py-4 text-foreground/80">{item.supplier || "—"}</td>
                    <td className="px-6 py-4 text-foreground/80">
                      {item.expiryDate
                        ? new Date(item.expiryDate).toLocaleDateString("en-PH")
                        : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-bold",
                          STATUS_STYLE[item.status]
                        )}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{item.updatedBy}</td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {/* A retired ingredient can only be brought back —
                              editing it would be a way of quietly putting it
                              back into service. */}
                          {!showArchived && (
                            <button
                              onClick={() => openEdit(item)}
                              disabled={isPending}
                              className="flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </button>
                          )}
                          <button
                            onClick={() => toggleArchive(item)}
                            aria-label={
                              showArchived
                                ? `Restore ${item.ingredientName}`
                                : `Archive ${item.ingredientName}`
                            }
                            disabled={isPending}
                            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                          >
                            {showArchived ? (
                              <ArchiveRestore className="h-4 w-4" />
                            ) : (
                              <Archive className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      </>
      )}

      <ConfirmDialog
        title="Archive category"
        open={archivingCategory !== null}
        onClose={() => setArchivingCategory(null)}
        onConfirm={confirmArchiveCategory}
        confirmLabel="Archive category"
        busy={isPending}
        error={error}
        message={
          <>
            Archive the <strong className="text-foreground">{archivingCategory?.name}</strong>{" "}
            category? It drops out of the filters and the ingredient form, and you can restore it
            from the Archived view. Its ingredients have to be archived first.
          </>
        }
      />

      {/* Add / edit ingredient */}
      <FormDialog
        title={editing ? `Edit ${editing.ingredientName}` : "Add Ingredient"}
        open={itemDialog}
        onClose={() => setItemDialog(false)}
        onSubmit={submitItem}
        submitLabel={editing ? "Save changes" : "Add ingredient"}
        submitting={isPending}
        error={error}
        wide
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ingredient name">
            <input
              value={form.ingredientName}
              onChange={(e) => setForm({ ...form, ingredientName: e.target.value })}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Category">
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              required
              className={inputClass}
            >
              <option value="">Select a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={
              editing
                ? `Stock quantity (was ${editing.stockQuantity.toLocaleString()} ${editing.unit})`
                : "Stock quantity"
            }
          >
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.stockQuantity}
              onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Unit" hint="Pick one or choose Others…" plain>
            <PresetSelect
              value={form.unit}
              onChange={(v) => setForm({ ...form, unit: v })}
              custom={unitCustom}
              setCustom={setUnitCustom}
              presets={UNIT_PRESETS}
              required
              placeholder="e.g. tbsp"
            />
          </Field>
          <Field label="Reorder level" hint="At or below this = Low." plain>
            <PresetSelect
              value={form.reorderLevel}
              onChange={(v) => setForm({ ...form, reorderLevel: v })}
              custom={reorderCustom}
              setCustom={setReorderCustom}
              presets={REORDER_PRESETS}
              inputType="number"
              placeholder="e.g. 15"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier">
            <input
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Expiry date">
            <input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        {/* Editing is the only way stock moves by hand, so say up front what
            the change will be recorded as. */}
        {editing && stockDelta !== 0 && (
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
            <span className="font-bold text-foreground">
              {editing.stockQuantity.toLocaleString()} →{" "}
              {Number(form.stockQuantity || 0).toLocaleString()} {form.unit || editing.unit}
            </span>
            <span className="text-muted-foreground">
              {stockDelta > 0
                ? ` — recorded as a delivery of ${stockDelta.toLocaleString()} ${form.unit || editing.unit}${form.supplier ? ` from ${form.supplier}` : ""}.`
                : ` — recorded as a stock correction of ${stockDelta.toLocaleString()} ${form.unit || editing.unit}.`}
            </span>
          </div>
        )}
      </FormDialog>

      {/* Add category */}
      <FormDialog
        title="Add Category"
        open={categoryDialog}
        onClose={() => setCategoryDialog(false)}
        onSubmit={submitCategory}
        submitLabel="Add category"
        submitting={isPending}
        error={error}
      >
        <Field
          label="Category name"
          hint="Ingredients in this category are shown under the chosen prep area."
        >
          <input
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            required
            placeholder="e.g. Frozen Goods"
            className={inputClass}
          />
        </Field>
        <Field label="Prep area">
          <select
            value={categoryStation}
            onChange={(e) => setCategoryStation(e.target.value as Station)}
            className={inputClass}
          >
            <option value="KITCHEN">Kitchen</option>
            <option value="BAR">Bar</option>
          </select>
        </Field>
      </FormDialog>
    </div>
  );
}

/**
 * A dropdown of common values with an "Others…" escape hatch that reveals a
 * free-text (or number) input — so Unit and Reorder level offer quick picks
 * without locking anyone out of an unusual value.
 */
function PresetSelect({
  value,
  onChange,
  custom,
  setCustom,
  presets,
  inputType = "text",
  required = false,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  custom: boolean;
  setCustom: (custom: boolean) => void;
  presets: string[];
  inputType?: "text" | "number";
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <>
      <select
        value={custom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        required={required}
        className={inputClass}
      >
        <option value="">Select…</option>
        {presets.map((preset) => (
          <option key={preset} value={preset}>
            {preset}
          </option>
        ))}
        <option value={CUSTOM}>Others…</option>
      </select>
      {custom && (
        <input
          type={inputType}
          {...(inputType === "number" ? { min: "0", step: "0.01" } : {})}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={cn(inputClass, "mt-2")}
        />
      )}
    </>
  );
}
