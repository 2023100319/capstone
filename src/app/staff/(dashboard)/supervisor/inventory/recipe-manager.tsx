"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Trash2, Pencil, AlertTriangle, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FormDialog, Field, inputClass } from "@/components/brand/form-dialog";
import { setRecipeLine, removeRecipeLine } from "@/app/actions/inventory";
import { cn } from "@/lib/utils";

export type RecipeRow = {
  id: string;
  name: string;
  categoryName: string;
  hasRecipe: boolean;
  /** Counted by hand instead of cooked from ingredients — has no recipe by design. */
  tracksStock: boolean;
  /** null when the item has no recipe, so nothing limits it yet. */
  canMake: number | null;
  unavailable: boolean;
  blockedBy: string[];
  /** Per-variation availability, present on variation items. */
  variations?: { label: string; canMake: number }[];
  /** The item's variation labels (from its variations JSON). */
  variationLabels: string[];
  lines: {
    id: string;
    /** Which variation this line feeds — "" on items with no variations. */
    variationLabel: string;
    inventoryItemId: string;
    ingredientName: string;
    unit: string;
    stockQuantity: number;
    quantity: number;
    servings: number;
  }[];
};

type Ingredient = { id: string; ingredientName: string; unit: string; stockQuantity: number };

const EMPTY_LINE = { inventoryItemId: "", quantity: "" };

/** Green while there's headroom, amber when it's nearly gone, red at zero. */
function servingsStyle(canMake: number) {
  if (canMake <= 0) return "bg-red-50 text-red-700 ring-red-200";
  if (canMake <= 5) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export function RecipeManager({
  recipes,
  ingredients,
  canManage,
}: {
  recipes: RecipeRow[];
  ingredients: Ingredient[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ menuItem: RecipeRow; lineId?: string } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_LINE, variationLabel: "" });
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Counted-by-hand items have no recipe on purpose and are managed on the
  // Stock-Counted Items tab, so listing them here as "No recipe set" would be
  // a false alarm.
  const filtered = recipes.filter(
    (r) =>
      !r.tracksStock &&
      `${r.name} ${r.categoryName}`.toLowerCase().includes(search.toLowerCase())
  );

  const selectedUnit = ingredients.find((i) => i.id === form.inventoryItemId)?.unit ?? "";

  function openAdd(menuItem: RecipeRow) {
    setEditing({ menuItem });
    setForm({ ...EMPTY_LINE, variationLabel: menuItem.variationLabels[0] ?? "" });
    setError("");
  }

  function openEdit(menuItem: RecipeRow, line: RecipeRow["lines"][number]) {
    setEditing({ menuItem, lineId: line.id });
    setForm({
      inventoryItemId: line.inventoryItemId,
      quantity: String(line.quantity),
      variationLabel: line.variationLabel,
    });
    setError("");
  }

  function submit() {
    if (!editing) return;
    setError("");
    startTransition(async () => {
      const result = await setRecipeLine({
        menuItemId: editing.menuItem.id,
        inventoryItemId: form.inventoryItemId,
        variationLabel: form.variationLabel,
        quantity: Number(form.quantity),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function remove(lineId: string) {
    setError("");
    startTransition(async () => {
      const result = await removeRecipeLine(lineId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Recipes</h2>
          <p className="text-sm text-muted-foreground">
            How much of each ingredient one serving uses. Paying an order deducts these
            automatically, and an item stops selling once any ingredient runs out.
          </p>
        </div>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items..."
            className="w-full rounded-lg bg-card py-2 pr-4 pl-9 text-sm text-foreground shadow-sm ring-1 ring-border transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50 sm:w-56"
          />
        </div>
      </div>

      {/* Ericahlicious keeps its real recipes private, so these are standard
          café quantities standing in for them. Saying so plainly matters: the
          deduction numbers below are only as right as these estimates. */}
      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <div className="text-xs text-amber-900">
          <p className="font-semibold">Sample recipes — not Ericahlicious&apos;s actual recipes.</p>
          <p className="mt-1">
            These are standard industry quantities used as placeholders, because the actual recipes
            are kept private. Stock deductions follow whatever is entered here, so edit any amount
            to match how the store really cooks — the numbers update straight away.
          </p>
        </div>
      </div>

      {error && !editing && <p className="text-sm text-destructive">{error}</p>}

      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center text-muted-foreground">
            No menu items found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((item) => (
            <Card key={item.id} className="border-0 shadow-sm">
              <CardContent className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{item.name}</p>
                    <span className="mt-1 inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {item.categoryName}
                    </span>
                  </div>
                  {item.hasRecipe ? (
                    <span
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-bold ring-1",
                        servingsStyle(item.canMake ?? 0)
                      )}
                    >
                      Can make: {item.canMake}
                    </span>
                  ) : (
                    <span className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      No recipe set
                    </span>
                  )}
                </div>

                {item.blockedBy.length > 0 && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                    Out of {item.blockedBy.join(", ")} — this item can&apos;t be ordered.
                  </p>
                )}

                {item.variationLabels.length > 0
                  ? // One ingredient set per variation — grouped, each with its
                    // own makeable count.
                    item.variationLabels.map((label) => {
                      const lines = item.lines.filter((l) => l.variationLabel === label);
                      const canMake = item.variations?.find((v) => v.label === label)?.canMake;
                      return (
                        <div key={label} className="rounded-lg border border-border p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-foreground">{label}</span>
                            {canMake !== undefined && (
                              <span
                                className={cn(
                                  "rounded-lg px-2.5 py-1 text-xs font-bold ring-1",
                                  servingsStyle(canMake)
                                )}
                              >
                                Can make: {canMake}
                              </span>
                            )}
                          </div>
                          {lines.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No ingredients linked for this variation yet.
                            </p>
                          ) : (
                            <RecipeLinesTable
                              lines={lines}
                              canManage={canManage}
                              isPending={isPending}
                              onEdit={(line) => openEdit(item, line)}
                              onRemove={remove}
                            />
                          )}
                        </div>
                      );
                    })
                  : item.lines.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No ingredients linked yet — nothing tracks when this item runs out.
                      </p>
                    ) : (
                      <RecipeLinesTable
                        lines={item.lines}
                        canManage={canManage}
                        isPending={isPending}
                        onEdit={(line) => openEdit(item, line)}
                        onRemove={remove}
                      />
                    )}

                {canManage && (
                  <button
                    onClick={() => openAdd(item)}
                    disabled={isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add ingredient
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FormDialog
        title={editing ? `${editing.lineId ? "Edit" : "Add"} ingredient — ${editing.menuItem.name}` : ""}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        submitLabel={editing?.lineId ? "Save changes" : "Add to recipe"}
        submitting={isPending}
        error={error}
      >
        {editing?.menuItem.variationLabels.length ? (
          <Field
            label="Variation"
            hint="Each variation has its own ingredient set — this line belongs to the one picked here."
          >
            <select
              value={form.variationLabel}
              onChange={(e) => setForm({ ...form, variationLabel: e.target.value })}
              required
              // Same lock as the ingredient: re-pointing a saved line would
              // create a second line rather than move this one.
              disabled={Boolean(editing?.lineId)}
              className={cn(inputClass, editing?.lineId && "cursor-not-allowed bg-muted")}
            >
              {editing.menuItem.variationLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <Field label="Ingredient">
          <select
            value={form.inventoryItemId}
            onChange={(e) => setForm({ ...form, inventoryItemId: e.target.value })}
            required
            // Changing which ingredient an existing line points at would just
            // create a second line, so it's locked once saved.
            disabled={Boolean(editing?.lineId)}
            className={cn(inputClass, editing?.lineId && "cursor-not-allowed bg-muted")}
          >
            <option value="">Select an ingredient</option>
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.ingredientName} ({i.stockQuantity.toLocaleString()} {i.unit} in stock)
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={`Quantity per serving${selectedUnit ? ` (${selectedUnit})` : ""}`}
          hint="Use the ingredient's own unit — no conversion. An estimate is fine."
        >
          <input
            type="number"
            min="0.001"
            step="any"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            required
            className={inputClass}
          />
        </Field>
      </FormDialog>
    </div>
  );
}

/** One recipe's ingredient rows — shared by the base view and each variation group. */
function RecipeLinesTable({
  lines,
  canManage,
  isPending,
  onEdit,
  onRemove,
}: {
  lines: RecipeRow["lines"];
  canManage: boolean;
  isPending: boolean;
  onEdit: (line: RecipeRow["lines"][number]) => void;
  onRemove: (lineId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="py-2 text-left font-medium">Ingredient</th>
            <th className="py-2 text-right font-medium">Per serving</th>
            <th className="py-2 text-right font-medium">In stock</th>
            <th className="py-2 text-right font-medium">Allows</th>
            {canManage && <th className="py-2" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b last:border-0">
              <td className="py-2 text-foreground">{line.ingredientName}</td>
              <td className="py-2 text-right text-foreground/80">
                {line.quantity.toLocaleString()} {line.unit}
              </td>
              <td className="py-2 text-right text-muted-foreground">
                {line.stockQuantity.toLocaleString()} {line.unit}
              </td>
              <td
                className={cn(
                  "py-2 text-right font-semibold",
                  line.servings <= 0 ? "text-red-600" : "text-foreground/80"
                )}
              >
                {line.servings}
              </td>
              {canManage && (
                <td className="py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(line)}
                      aria-label={`Edit ${line.ingredientName}`}
                      disabled={isPending}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onRemove(line.id)}
                      aria-label={`Remove ${line.ingredientName}`}
                      disabled={isPending}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
