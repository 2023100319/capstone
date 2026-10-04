"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search, Plus, Pencil, Archive, ArchiveRestore, Tag, X,
  ImagePlus, Loader2, AlertTriangle,
} from "lucide-react";
import { FormDialog, Field, inputClass } from "@/components/brand/form-dialog";
import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { useUploadThing } from "@/lib/uploadthing";
import {
  createMenuItem,
  updateMenuItem,
  setMenuItemArchived,
  createMenuCategory,
  setMenuCategoryArchived,
} from "@/app/actions/menu-admin";
import { STOCK_UNITS, validateStockCount } from "@/lib/stock-counted";
import type { StockMode } from "@prisma/client";
import { cn } from "@/lib/utils";

type RecipeLine = {
  variationLabel?: string;
  inventoryItemId: string;
  ingredientName: string;
  unit: string;
  quantity: number;
};

/** One ingredient line in the form, as the user is editing it. */
type RecipeDraftLine = { inventoryItemId: string; quantity: string };

type AdminMenuItem = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  price: number;
  originalPrice: number | null;
  isPromo: boolean;
  isRecommended: boolean;
  imageUrl: string;
  /** RECIPE = gated by ingredient stock; DIRECT = gated by the count below. */
  stockMode: StockMode;
  stockQuantity: number;
  lowStockAt: number;
  unitLabel: string;
  variations: { label: string; price: number }[];
  /** Unlabelled ("" variationLabel) lines are the item's base recipe; the rest
   *  belong to the variation named on the line. */
  recipe: RecipeLine[];
  /** Derived from the recipe, or free-typed when the item has none. */
  ingredients: string[];
  hasRecipe: boolean;
  tracksStock: boolean;
  canMake: number | null;
  unavailable: boolean;
  blockedBy: string[];
};

type Category = { id: string; name: string; tracksStockDirectly: boolean };
type Ingredient = { id: string; ingredientName: string; unit: string; stockQuantity: number };

/** Ready-made variation labels so nobody has to remember a text format. */
const VARIATION_PRESETS = ["16oz", "22oz", "Small", "Medium", "Large", "Hot", "Iced"];
const CUSTOM = "__custom__";

/** Below this many servings an item is worth flagging before it runs out. */
const LOW_SERVINGS = 5;

const EMPTY_ITEM = {
  name: "",
  description: "",
  categoryId: "",
  price: "",
  originalPrice: "",
  isPromo: false,
  isRecommended: false,
  imageUrl: "",
  stockMode: "RECIPE" as StockMode,
  stockQuantity: "",
  lowStockAt: "10",
  unitLabel: STOCK_UNITS[0],
  recipe: [] as RecipeDraftLine[],
  ingredients: [] as string[],
  variations: [] as { label: string; price: string; ingredients: RecipeDraftLine[] }[],
};

/**
 * What the card shows in place of a stock count. A counted item reports its own
 * number; everything else is derived from the recipe rather than typed by anyone.
 */
function availabilityBadge(item: AdminMenuItem) {
  // A counted item has no recipe on purpose — that's not a gap to fix, so show
  // the number that actually gates it instead of calling it unconfigured.
  if (item.tracksStock) {
    if (item.stockQuantity <= 0) {
      return { label: "Out of stock", className: "bg-red-500 text-white" };
    }
    if (item.stockQuantity <= item.lowStockAt) {
      return {
        label: `Low · ${item.stockQuantity} ${item.unitLabel}`,
        className: "bg-amber-500 text-white",
      };
    }
    return {
      label: `${item.stockQuantity} ${item.unitLabel} on hand`,
      className: "bg-sky-100 text-sky-800",
    };
  }
  if (!item.hasRecipe) {
    return { label: "No recipe set", className: "bg-neutral-200 text-neutral-700" };
  }
  if (item.canMake === 0) {
    return {
      label: `Out of ${item.blockedBy[0] ?? "ingredients"}`,
      className: "bg-red-500 text-white",
    };
  }
  if ((item.canMake ?? 0) <= LOW_SERVINGS) {
    return { label: `Low · ${item.canMake} left`, className: "bg-amber-500 text-white" };
  }
  return { label: `Can make ${item.canMake}`, className: "bg-emerald-500 text-white" };
}

export function MenuManager({
  items,
  categories,
  ingredients,
  showArchived,
  canManage,
}: {
  items: AdminMenuItem[];
  categories: Category[];
  ingredients: Ingredient[];
  showArchived: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [itemDialog, setItemDialog] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editing, setEditing] = useState<AdminMenuItem | null>(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [categoryForm, setCategoryForm] = useState({ name: "", tracksStockDirectly: false });
  const [archivingCategory, setArchivingCategory] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const { startUpload, isUploading } = useUploadThing("menuImage", {
    onClientUploadComplete: (res) => {
      const url = res?.[0]?.ufsUrl;
      if (url) setForm((prev) => ({ ...prev, imageUrl: url }));
    },
    onUploadError: (err) => setError(err.message),
  });

  const filtered = items.filter(
    (item) =>
      (activeCategory === "all" || item.categoryId === activeCategory) &&
      item.name.toLowerCase().includes(search.toLowerCase())
  );

  /** A category only supplies the DEFAULT tracking mode for items added to it. */
  const defaultModeFor = (categoryId: string): StockMode =>
    categories.find((c) => c.id === categoryId)?.tracksStockDirectly ? "DIRECT" : "RECIPE";

  function openCreate() {
    const categoryId = categories[0]?.id ?? "";
    setEditing(null);
    setForm({ ...EMPTY_ITEM, categoryId, stockMode: defaultModeFor(categoryId) });
    setError("");
    setItemDialog(true);
  }

  /**
   * Moving an item to a different category re-applies that category's default,
   * since the usual reason to move it is that it is now that kind of thing. The
   * radio sits right below, so overriding it again is one click.
   */
  function changeCategory(categoryId: string) {
    setForm((prev) => ({ ...prev, categoryId, stockMode: defaultModeFor(categoryId) }));
  }

  function openEdit(item: AdminMenuItem) {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description,
      categoryId: item.categoryId,
      price: String(item.price),
      originalPrice: item.originalPrice ? String(item.originalPrice) : "",
      isPromo: item.isPromo,
      isRecommended: item.isRecommended,
      imageUrl: item.imageUrl,
      // The item's own saved mode wins here — never the category default, or
      // editing an item's price would silently re-track it.
      stockMode: item.stockMode,
      stockQuantity: item.stockMode === "DIRECT" ? String(item.stockQuantity) : "",
      lowStockAt: String(item.lowStockAt || 10),
      unitLabel: item.unitLabel || STOCK_UNITS[0],
      // Unlabelled recipe lines are the base recipe (shown when the item has no
      // variations); each variation's own lines ride inside that variation.
      recipe: item.recipe
        .filter((line) => (line.variationLabel ?? "") === "")
        .map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: String(line.quantity) })),
      // Only meaningful for recipe-less items; for the rest it is regenerated
      // from the recipe on save and never shown in the form.
      ingredients: item.ingredients,
      variations: item.variations.map((v) => ({
        label: v.label,
        price: String(v.price),
        ingredients: item.recipe
          .filter((line) => line.variationLabel === v.label)
          .map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: String(line.quantity) })),
      })),
    });
    setError("");
    setItemDialog(true);
  }

  // ---- recipe rows -------------------------------------------------------
  /** The first ingredient not already on this recipe, so rows never collide. */
  function nextFreeIngredient() {
    const used = new Set(form.recipe.map((line) => line.inventoryItemId));
    return ingredients.find((i) => !used.has(i.id))?.id ?? "";
  }

  function addRecipeLine() {
    setForm({
      ...form,
      recipe: [...form.recipe, { inventoryItemId: nextFreeIngredient(), quantity: "" }],
    });
  }

  function updateRecipeLine(index: number, patch: Partial<{ inventoryItemId: string; quantity: string }>) {
    const recipe = form.recipe.map((line, i) => (i === index ? { ...line, ...patch } : line));
    setForm({ ...form, recipe });
  }

  function removeRecipeLine(index: number) {
    setForm({ ...form, recipe: form.recipe.filter((_, i) => i !== index) });
  }

  // ---- free-typed ingredient rows (bread & pastries) ---------------------
  function addIngredientLine() {
    setForm({ ...form, ingredients: [...form.ingredients, ""] });
  }

  function updateIngredientLine(index: number, value: string) {
    setForm({
      ...form,
      ingredients: form.ingredients.map((line, i) => (i === index ? value : line)),
    });
  }

  function removeIngredientLine(index: number) {
    setForm({ ...form, ingredients: form.ingredients.filter((_, i) => i !== index) });
  }

  // ---- variation rows ----------------------------------------------------
  /**
   * Turning variations on for the first time carries the existing flat recipe
   * into the first variation as a starting point — the same starting state the
   * data migration gave every variation item — while later variations start
   * empty so each one gets its own ingredient set.
   */
  function addVariation() {
    const used = new Set(form.variations.map((v) => v.label));
    const label = VARIATION_PRESETS.find((p) => !used.has(p)) ?? "";
    const starter =
      form.variations.length === 0 && form.recipe.length > 0 ? [...form.recipe] : [];
    setForm({
      ...form,
      variations: [...form.variations, { label, price: "", ingredients: starter }],
    });
  }

  function updateVariation(
    index: number,
    patch: Partial<{ label: string; price: string; ingredients: RecipeDraftLine[] }>
  ) {
    const variations = form.variations.map((v, i) => (i === index ? { ...v, ...patch } : v));
    setForm({ ...form, variations });
  }

  function removeVariation(index: number) {
    // The variation's ingredient set goes with it — it lives on the variation.
    setForm({ ...form, variations: form.variations.filter((_, i) => i !== index) });
  }

  // ---- per-variation ingredient rows -------------------------------------
  /** The first ingredient not already in this variation's own set. */
  function nextFreeVariationIngredient(vIndex: number) {
    const used = new Set(form.variations[vIndex].ingredients.map((line) => line.inventoryItemId));
    return ingredients.find((i) => !used.has(i.id))?.id ?? "";
  }

  function addVariationIngredient(vIndex: number) {
    setForm({
      ...form,
      variations: form.variations.map((v, i) =>
        i === vIndex
          ? {
              ...v,
              ingredients: [...v.ingredients, { inventoryItemId: nextFreeVariationIngredient(vIndex), quantity: "" }],
            }
          : v
      ),
    });
  }

  function updateVariationIngredient(
    vIndex: number,
    lineIndex: number,
    patch: Partial<RecipeDraftLine>
  ) {
    setForm({
      ...form,
      variations: form.variations.map((v, i) =>
        i === vIndex
          ? { ...v, ingredients: v.ingredients.map((line, j) => (j === lineIndex ? { ...line, ...patch } : line)) }
          : v
      ),
    });
  }

  function removeVariationIngredient(vIndex: number, lineIndex: number) {
    setForm({
      ...form,
      variations: form.variations.map((v, i) =>
        i === vIndex ? { ...v, ingredients: v.ingredients.filter((_, j) => j !== lineIndex) } : v
      ),
    });
  }

  function submitItem() {
    setError("");

    const counted = form.stockMode === "DIRECT";

    // Catch the count problems here so the message lands next to the fields
    // rather than as a generic save failure. The server re-checks all of it.
    if (counted) {
      const invalid = validateStockCount({
        unitLabel: form.unitLabel,
        stockCount: Number(form.stockQuantity || 0),
        lowStockAt: Number(form.lowStockAt || 0),
      });
      if (invalid) {
        setError(invalid);
        return;
      }
    }

    // Blank rows are dropped rather than rejected — an empty line the user never
    // filled in shouldn't block the save.
    const cleanLines = (rows: RecipeDraftLine[]) =>
      rows
        .filter((line) => line.inventoryItemId && Number(line.quantity) > 0)
        .map((line) => ({
          inventoryItemId: line.inventoryItemId,
          quantity: Number(line.quantity),
        }));

    const recipe = counted ? [] : cleanLines(form.recipe);

    const variations = form.variations
      .filter((v) => v.label.trim() && Number(v.price) > 0)
      .map((v) => ({
        label: v.label.trim(),
        price: Number(v.price),
        ingredients: counted ? [] : cleanLines(v.ingredients),
      }));

    // Once a variation exists, its ingredient sets are the recipe — the flat
    // list stops being sent, so the two can never disagree about what the item
    // is made of.
    const payload = {
      name: form.name,
      description: form.description,
      categoryId: form.categoryId,
      price: Number(form.price),
      originalPrice: form.originalPrice ? Number(form.originalPrice) : null,
      isPromo: form.isPromo,
      isRecommended: form.isRecommended,
      imageUrl: form.imageUrl,
      stockMode: form.stockMode,
      stockQuantity: counted ? Number(form.stockQuantity || 0) : 0,
      lowStockAt: counted ? Number(form.lowStockAt || 0) : 0,
      unitLabel: form.unitLabel || STOCK_UNITS[0],
      variations,
      // The server drops the recipe for a counted item anyway; sending an empty
      // list makes that obvious here too.
      recipe: counted || variations.length > 0 ? [] : recipe,
      ingredients: form.ingredients.map((line) => line.trim()).filter(Boolean),
    };

    startTransition(async () => {
      const result = editing
        ? await updateMenuItem(editing.id, payload)
        : await createMenuItem(payload);
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
      const result = await createMenuCategory(categoryForm);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setCategoryDialog(false);
      setCategoryForm({ name: "", tracksStockDirectly: false });
      router.refresh();
    });
  }

  function confirmArchiveCategory() {
    if (!archivingCategory) return;
    setError("");
    startTransition(async () => {
      const result = await setMenuCategoryArchived(archivingCategory.id, true);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (activeCategory === archivingCategory.id) setActiveCategory("all");
      setArchivingCategory(null);
      router.refresh();
    });
  }

  /** Restore has no cascade and nothing to confirm, so it runs straight away. */
  function restoreCategory(id: string) {
    setError("");
    startTransition(async () => {
      const result = await setMenuCategoryArchived(id, false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (activeCategory === id) setActiveCategory("all");
      router.refresh();
    });
  }

  function toggleArchive(item: AdminMenuItem) {
    startTransition(async () => {
      const result = await setMenuItemArchived(item.id, !showArchived);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const missingRecipes = items.filter((i) => !i.hasRecipe && !i.tracksStock).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Menu Management</h1>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu items..."
              className="w-full rounded-lg bg-card py-2 pr-4 pl-9 text-sm text-foreground shadow-sm ring-1 ring-border transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50 sm:w-56"
            />
          </div>
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
                <Plus className="h-4 w-4" /> Add Items
              </button>
            </>
          )}
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

      {/* Availability comes from ingredients, so an item without a recipe is a
          gap in the setup rather than something that can sell out. */}
      {!showArchived && missingRecipes > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
          {missingRecipes} item{missingRecipes === 1 ? " has" : "s have"} no ingredients linked yet.
          Until they do, the system can&apos;t tell when they run out — edit the item and add its
          ingredients.
        </p>
      )}

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {[{ id: "all", name: "All" }, ...categories].map((cat) => (
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
        ))}
      </div>

      {error && !itemDialog && !categoryDialog && !archivingCategory && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Items */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.length === 0 ? (
          <div className="col-span-full py-16 text-center text-muted-foreground">
            {showArchived ? "No archived items." : "No items in this category."}
          </div>
        ) : (
          filtered.map((item) => {
            const badge = availabilityBadge(item);
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative h-44 w-full bg-muted">
                  {item.imageUrl && (
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className={cn("object-cover", item.unavailable && "opacity-50")}
                    />
                  )}
                  <span
                    className={cn(
                      "absolute top-2.5 left-2.5 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm",
                      badge.className
                    )}
                  >
                    {badge.label}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-foreground">{item.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-primary">₱{item.price}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {item.categoryName}
                        </span>
                        {item.isPromo && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                            Promo
                          </span>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button
                          onClick={() => openEdit(item)}
                          aria-label={`Edit ${item.name}`}
                          disabled={isPending}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleArchive(item)}
                          aria-label={showArchived ? `Restore ${item.name}` : `Archive ${item.name}`}
                          disabled={isPending}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          {showArchived ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </button>
                        {/* No Delete: archiving is the only way off the menu, so
                            an item's history and past orders always survive. */}
                      </div>
                    )}
                  </div>

                  {/* Recipe items show the linked amounts; recipe-less ones show
                      whatever was typed, so neither kind of card reads as empty. */}
                  {item.recipe.length > 0 ? (
                    <div className="mt-3 border-t border-border/60 pt-3">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Ingredients ({item.recipe.length})
                      </p>
                      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {item.recipe
                          .map((line) => `${line.ingredientName} ${line.quantity}${line.unit}`)
                          .join(" · ")}
                      </p>
                    </div>
                  ) : (
                    item.ingredients.length > 0 && (
                      <div className="mt-3 border-t border-border/60 pt-3">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Ingredients ({item.ingredients.length})
                        </p>
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {item.ingredients.join(" · ")}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        title="Archive category"
        open={archivingCategory !== null}
        onClose={() => setArchivingCategory(null)}
        onConfirm={confirmArchiveCategory}
        confirmLabel="Archive category"
        busy={isPending}
        error={error}
        message={(() => {
          const count = archivingCategory
            ? items.filter((i) => i.categoryId === archivingCategory.id).length
            : 0;
          return (
            <>
              Archive the{" "}
              <strong className="text-foreground">{archivingCategory?.name}</strong> category?
              {count > 0 ? (
                <>
                  {" "}
                  Its <strong className="text-foreground">{count}</strong> menu item
                  {count === 1 ? "" : "s"} will be archived too and taken off the customer menu.
                </>
              ) : (
                " It will be taken off the customer menu."
              )}{" "}
              You can restore it later from the Archived view.
            </>
          );
        })()}
      />


      {/* Add / edit item */}
      <FormDialog
        title={editing ? `Edit ${editing.name}` : "Add Menu Item"}
        open={itemDialog}
        onClose={() => setItemDialog(false)}
        onSubmit={submitItem}
        submitLabel={editing ? "Save changes" : "Add item"}
        submitting={isPending}
        error={error}
        wide
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Category">
            <select
              value={form.categoryId}
              onChange={(e) => changeCategory(e.target.value)}
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

        <Field label="Description">
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={inputClass}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price (₱)">
            <input
              type="number"
              min="1"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Original price (₱)" hint="Optional — shown crossed out for promos.">
            <input
              type="number"
              min="1"
              step="0.01"
              value={form.originalPrice}
              onChange={(e) => setForm({ ...form, originalPrice: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Photo" hint="Upload an image (max 4MB) or paste a URL below." plain>
          {form.imageUrl ? (
            <div className="relative h-40 w-full overflow-hidden rounded-lg border border-border bg-muted">
              <Image
                src={form.imageUrl}
                alt="Menu item preview"
                fill
                sizes="(max-width: 640px) 100vw, 400px"
                className="object-cover"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, imageUrl: "" })}
                aria-label="Remove photo"
                className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white transition-colors hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50",
                isUploading && "pointer-events-none opacity-70"
              )}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Uploading…</span>
                </>
              ) : (
                <>
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Upload a photo</span>
                  <span className="text-xs text-muted-foreground">PNG or JPG, up to 4MB</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) startUpload([file]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <input
            type="url"
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="or paste an image URL (https://...)"
            className={cn(inputClass, "mt-2")}
          />
        </Field>

        {/* How the item's stock is tracked decides everything below it: an
            ingredient-based item is gated by the recipe picker, a counted one by
            the number typed here. Picking a category above sets the default. */}
        <StockModeField
          mode={form.stockMode}
          onChange={(stockMode) => setForm({ ...form, stockMode })}
          categoryDefault={
            categories.find((c) => c.id === form.categoryId)?.tracksStockDirectly ?? false
          }
        />

        {form.stockMode === "DIRECT" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Stock on hand">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stockQuantity}
                  onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                  placeholder="0"
                  className={inputClass}
                />
              </Field>
              <Field label="Unit">
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
              <Field label="Low-stock at" hint="At or below this it reads Low.">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.lowStockAt}
                  onChange={(e) => setForm({ ...form, lowStockAt: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <FreeIngredientsField
              rows={form.ingredients}
              onAdd={addIngredientLine}
              onChange={updateIngredientLine}
              onRemove={removeIngredientLine}
            />
          </>
        ) : form.variations.length === 0 ? (
          <IngredientsField
            rows={form.recipe}
            ingredients={ingredients}
            onAdd={addRecipeLine}
            onChange={updateRecipeLine}
            onRemove={removeRecipeLine}
          />
        ) : null}

        <VariationsField
          rows={form.variations}
          basePrice={form.price}
          stockMode={form.stockMode}
          ingredients={ingredients}
          onAdd={addVariation}
          onChange={updateVariation}
          onRemove={removeVariation}
          onAddIngredient={addVariationIngredient}
          onIngredientChange={updateVariationIngredient}
          onIngredientRemove={removeVariationIngredient}
        />

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isPromo}
              onChange={(e) => setForm({ ...form, isPromo: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            Promo
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.isRecommended}
              onChange={(e) => setForm({ ...form, isRecommended: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            Recommended
          </label>
        </div>
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
        <Field label="Category name">
          <input
            value={categoryForm.name}
            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            required
            placeholder="e.g. Milk Tea"
            className={inputClass}
          />
        </Field>

        {/* Only a default for items added later — ticking it never rewrites how
            an existing item is tracked. */}
        <label className="flex cursor-pointer gap-2.5 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
          <input
            type="checkbox"
            checked={categoryForm.tracksStockDirectly}
            onChange={(e) =>
              setCategoryForm({ ...categoryForm, tracksStockDirectly: e.target.checked })
            }
            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-border"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              Count items in this category by hand
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              For finished goods like bread, donuts or bottled drinks — stock is a number you type
              rather than something worked out from ingredients. New items here start that way; you
              can still change any of them individually.
            </span>
          </span>
        </label>
      </FormDialog>
    </div>
  );
}

/**
 * The one choice that decides how an item's availability works.
 *
 * It lives here rather than on the category because the two do not always
 * agree — a café sells cooked pasta and pre-baked garlic bread out of the same
 * "Pica-Pica" list. The category still supplies the default so the common case
 * is one click, and this note says which way that default points.
 */
function StockModeField({
  mode,
  onChange,
  categoryDefault,
}: {
  mode: StockMode;
  onChange: (mode: StockMode) => void;
  /** True when the chosen category is set to count its items by hand. */
  categoryDefault: boolean;
}) {
  const OPTIONS: { value: StockMode; label: string; body: string }[] = [
    {
      value: "RECIPE",
      label: "Ingredient-based",
      body: "Made to order. Link its ingredients below and selling it deducts them from Inventory.",
    },
    {
      value: "DIRECT",
      label: "Direct stock count",
      body: "A finished good. You type how many are on hand and selling it lowers that number.",
    },
  ];

  return (
    <div className="rounded-xl border border-border p-4">
      <span className="text-sm font-medium text-foreground">
        How is this item&apos;s stock tracked?
      </span>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">
        This category defaults to{" "}
        <span className="font-medium text-foreground">
          {categoryDefault ? "direct stock count" : "ingredient-based"}
        </span>
        , but you can set it per item.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors",
              mode === option.value
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50"
            )}
          >
            <input
              type="radio"
              name="stockMode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => onChange(option.value)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{option.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.body}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Ingredients are picked from the inventory, never typed, so every line points
 * at a real stock row the system can deduct from and watch. Rendered either as
 * its own card (the item's one base recipe) or embedded inside a variation
 * block, where it becomes that variation's ingredient set.
 */
function IngredientsField({
  rows,
  ingredients,
  onAdd,
  onChange,
  onRemove,
  embedded = false,
}: {
  rows: { inventoryItemId: string; quantity: string }[];
  ingredients: Ingredient[];
  onAdd: () => void;
  onChange: (index: number, patch: Partial<{ inventoryItemId: string; quantity: string }>) => void;
  onRemove: (index: number) => void;
  /** Inside a variation card: skip the outer box and the card-level heading. */
  embedded?: boolean;
}) {
  const used = new Set(rows.map((r) => r.inventoryItemId));

  const body = (
    <>
      {!embedded && (
        <>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Ingredients</span>
            <span className="text-xs text-muted-foreground">{rows.length} linked</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            How much of each one a single serving uses. Paying an order deducts exactly these amounts,
            and the item stops selling once any of them runs out.
          </p>
        </>
      )}

      {rows.length === 0 ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No ingredients yet — without them the system can&apos;t track when this item runs out.
        </p>
      ) : (
        <div className="mb-3 space-y-2">
          {rows.map((row, index) => {
            const ingredient = ingredients.find((i) => i.id === row.inventoryItemId);
            const amount = Number(row.quantity);
            const servings =
              ingredient && amount > 0 ? Math.floor(ingredient.stockQuantity / amount) : null;

            return (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <select
                  value={row.inventoryItemId}
                  onChange={(e) => onChange(index, { inventoryItemId: e.target.value })}
                  className={cn(inputClass, "min-w-0 flex-1 sm:flex-[2]")}
                >
                  <option value="">Select an ingredient</option>
                  {ingredients.map((i) => (
                    // Already-used ingredients stay visible but unpickable, so
                    // one recipe can't list the same thing twice.
                    <option
                      key={i.id}
                      value={i.id}
                      disabled={i.id !== row.inventoryItemId && used.has(i.id)}
                    >
                      {i.ingredientName} — {i.stockQuantity.toLocaleString()} {i.unit} in stock
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={row.quantity}
                    onChange={(e) => onChange(index, { quantity: e.target.value })}
                    placeholder="0"
                    className={cn(inputClass, "w-24 text-right")}
                  />
                  <span className="w-10 text-xs text-muted-foreground">
                    {ingredient?.unit ?? ""}
                  </span>
                </div>

                <span
                  className={cn(
                    "w-28 text-xs",
                    servings === 0 ? "font-semibold text-red-600" : "text-muted-foreground"
                  )}
                >
                  {servings === null ? "—" : `≈ ${servings} servings`}
                </span>

                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label="Remove ingredient"
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        disabled={rows.length >= ingredients.length}
        className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> Add ingredient
      </button>
    </>
  );

  if (embedded) return <div>{body}</div>;
  return <div className="rounded-xl border border-border p-4">{body}</div>;
}

/**
 * The Ingredients section for counted items. These are finished before they're
 * sold rather than assembled per order, so there is nothing to deduct and
 * nothing to pick from inventory — each line is whatever the baker wants to
 * write. Purely descriptive: it never affects availability.
 */
function FreeIngredientsField({
  rows,
  onAdd,
  onChange,
  onRemove,
}: {
  rows: string[];
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">Ingredients</span>
        <span className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? "line" : "lines"}
        </span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Write what goes into it — free-form, e.g. &ldquo;Bread flour 500g&rdquo;. These lines are not
        linked to ingredient stock; how many are left to sell is the &ldquo;Stock on hand&rdquo;
        above.
      </p>

      {rows.length === 0 ? (
        <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Nothing listed yet — this is optional and does not affect availability.
        </p>
      ) : (
        <div className="mb-3 space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={row}
                onChange={(e) => onChange(index, e.target.value)}
                placeholder="e.g. Bread flour 500g"
                className={cn(inputClass, "min-w-0 flex-1")}
              />
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label="Remove ingredient"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
      >
        <Plus className="h-3.5 w-3.5" /> Add ingredient
      </button>
    </div>
  );
}

/**
 * Sizes and serving styles are picked from a list rather than typed.
 *
 * For an ingredient-based item each variation carries its OWN ingredient set —
 * one variation, one set of ingredients; two variations, two sets — because a
 * 16oz and a 22oz of the same latte use different amounts. Counted items keep
 * variations price-only, since their stock is the hand-typed count.
 */
function VariationsField({
  rows,
  basePrice,
  stockMode,
  ingredients,
  onAdd,
  onChange,
  onRemove,
  onAddIngredient,
  onIngredientChange,
  onIngredientRemove,
}: {
  rows: { label: string; price: string; ingredients: RecipeDraftLine[] }[];
  basePrice: string;
  stockMode: StockMode;
  ingredients: Ingredient[];
  onAdd: () => void;
  onChange: (
    index: number,
    patch: Partial<{ label: string; price: string; ingredients: RecipeDraftLine[] }>
  ) => void;
  onRemove: (index: number) => void;
  onAddIngredient: (vIndex: number) => void;
  onIngredientChange: (vIndex: number, lineIndex: number, patch: Partial<RecipeDraftLine>) => void;
  onIngredientRemove: (vIndex: number, lineIndex: number) => void;
}) {
  const perVariationIngredients = stockMode === "RECIPE" && rows.length > 0;

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">Variations</span>
        <span className="text-xs text-muted-foreground">optional</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {perVariationIngredients
          ? "Each variation gets its own ingredient set below — one set per variation, so the right amounts are deducted for whichever one sells. Removing a variation removes its ingredients too."
          : `Sizes or serving styles the customer can choose, each with its own price. Leave empty to sell this item at ₱${basePrice || "0"} only.`}
      </p>

      {rows.length > 0 && (
        <div className="mb-3 space-y-3">
          {rows.map((row, index) => {
            const isCustom = row.label !== "" && !VARIATION_PRESETS.includes(row.label);
            const otherLabels = new Set(rows.filter((_, i) => i !== index).map((r) => r.label));

            return (
              <div
                key={index}
                className={cn(
                  "rounded-lg p-3",
                  perVariationIngredients ? "border border-border bg-muted/30" : "space-y-2"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={isCustom || row.label === "" ? CUSTOM : row.label}
                    onChange={(e) =>
                      onChange(index, { label: e.target.value === CUSTOM ? "" : e.target.value })
                    }
                    className={cn(inputClass, "w-36")}
                  >
                    {VARIATION_PRESETS.map((preset) => (
                      <option key={preset} value={preset} disabled={otherLabels.has(preset)}>
                        {preset}
                      </option>
                    ))}
                    <option value={CUSTOM}>Custom…</option>
                  </select>

                  {(isCustom || row.label === "") && (
                    <input
                      value={row.label}
                      onChange={(e) => onChange(index, { label: e.target.value })}
                      placeholder="Label, e.g. 1 Litre"
                      className={cn(inputClass, "w-40")}
                    />
                  )}

                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">₱</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={row.price}
                      onChange={(e) => onChange(index, { price: e.target.value })}
                      placeholder="0"
                      className={cn(inputClass, "w-28 text-right")}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label="Remove variation"
                    className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {perVariationIngredients && (
                  <IngredientsField
                    embedded
                    rows={row.ingredients}
                    ingredients={ingredients}
                    onAdd={() => onAddIngredient(index)}
                    onChange={(lineIndex, patch) => onIngredientChange(index, lineIndex, patch)}
                    onRemove={(lineIndex) => onIngredientRemove(index, lineIndex)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        disabled={rows.length >= 6 || (perVariationIngredients && ingredients.length === 0)}
        className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> Add variation
      </button>
    </div>
  );
}
