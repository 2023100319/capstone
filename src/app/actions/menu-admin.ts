"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireCan } from "@/lib/guards";
import { menuAvailability } from "@/lib/availability";
import { logActivity } from "@/lib/activity";
import { STOCK_COUNT_MAX } from "@/lib/stock-counted";

/** One recipe line, in the ingredient's own unit. Same shape the Inventory
 *  page's Recipes tab writes — both end up in the single RecipeItem table. */
const recipeSchema = z.object({
  inventoryItemId: z.string().min(1, "Pick an ingredient."),
  quantity: z.number().positive("Ingredient amount must be greater than zero.").max(1_000_000),
});

const variationSchema = z.object({
  label: z.string().trim().min(1).max(30),
  price: z.number().positive().max(100000),
  // This variation's own ingredient set — one serving of THIS variation eats
  // exactly these. Kept on the variation, not the item, because a 16oz and a
  // 22oz of the same latte use different amounts.
  ingredients: z.array(recipeSchema).max(30),
});

/** A free-typed ingredient line, used by counted items. Descriptive only:
 *  unlike recipeSchema it points at no InventoryItem, so nothing is deducted
 *  and availability is unaffected. */
const freeIngredientSchema = z
  .string()
  .trim()
  .min(1, "Ingredient cannot be blank.")
  .max(80);

const itemSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(80),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  categoryId: z.string().min(1, "Pick a category."),
  price: z.number().positive("Price must be greater than zero.").max(100000),
  originalPrice: z.number().positive().max(100000).nullable().optional(),
  isPromo: z.boolean(),
  isRecommended: z.boolean(),
  imageUrl: z.string().url("Image must be a valid URL.").max(500).optional().or(z.literal("")),
  variations: z.array(variationSchema).max(6),
  // Only meaningful when `variations` is empty — a variation item's ingredients
  // ride on each variation instead. Sent either way; the writes decide.
  recipe: z.array(recipeSchema).max(30),
  ingredients: z.array(freeIngredientSchema).max(30).optional(),
  // How this item's stock is tracked. RECIPE gates it on ingredient stock;
  // DIRECT gates it on the count below, which staff type by hand.
  stockMode: z.enum(["RECIPE", "DIRECT"]).default("RECIPE"),
  stockQuantity: z
    .number()
    .int("Stock must be a whole number.")
    .min(0, "Stock cannot be negative.")
    .max(STOCK_COUNT_MAX, "Stock is too large.")
    .default(0),
  lowStockAt: z
    .number()
    .int("Low-stock level must be a whole number.")
    .min(0, "Low-stock level cannot be negative.")
    .max(STOCK_COUNT_MAX, "Low-stock level is too large.")
    .default(0),
  unitLabel: z.string().trim().min(1, "Choose a unit.").max(20).default("pcs"),
});

const categorySchema = z.object({
  name: z.string().trim().min(2, "Category name is too short.").max(40),
  // Only the default for items added to this category — never retroactive, so
  // ticking it later does not silently rewrite how existing items are tracked.
  tracksStockDirectly: z.boolean().default(false),
});

function revalidateMenuViews() {
  revalidatePath("/menu");
  revalidatePath("/");
  for (const role of ["admin", "supervisor", "owner"]) {
    revalidatePath(`/staff/${role}/menu`);
    // Editing a recipe here moves the same numbers the Inventory Recipes tab and
    // the dashboard alerts read.
    revalidatePath(`/staff/${role}/inventory`);
    revalidatePath(`/staff/${role}`);
  }
}

function fail(error: string) {
  return { success: false as const, error };
}

/** "₱170" / "₱169.50" — for the one-line details on the Activity feed. */
function peso(amount: number) {
  return `₱${amount.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

/** Everything except archived items — or only the archived ones. */
export async function getAdminMenuItems(archived = false) {
  const items = await prisma.menuItem.findMany({
    where: archived ? { status: "ARCHIVED" } : { status: { not: "ARCHIVED" } },
    include: {
      category: true,
      recipe: { include: { inventoryItem: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description ?? "",
    categoryId: item.categoryId,
    categoryName: item.category.name,
    price: item.price,
    originalPrice: item.originalPrice,
    isPromo: item.isPromo,
    isRecommended: item.isRecommended,
    imageUrl: item.imageUrl ?? "",
    // How this item's stock works, and the numbers behind a counted one. The
    // form needs all four to round-trip an edit without losing anything.
    stockMode: item.stockMode,
    stockQuantity: item.stockQuantity,
    lowStockAt: item.lowStockAt,
    unitLabel: item.unitLabel,
    // Spread first — it carries its own optional `variations` availability
    // field that the menu item's variation JSON below must not be overwritten
    // by (they are different things that share a name).
    ...menuAvailability(item),
    variations: (item.variations as { label: string; price: number }[] | null) ?? [],
    // Derived from the recipe for cooked-to-order items; free-typed for the
    // recipe-less ones. Same string[] shape either way.
    ingredients: (item.ingredients as string[] | null) ?? [],
    recipe: item.recipe.map((line) => ({
      variationLabel: line.variationLabel,
      inventoryItemId: line.inventoryItemId,
      ingredientName: line.inventoryItem.ingredientName,
      unit: line.inventoryItem.unit,
      quantity: line.quantity,
    })),
  }));
}

export async function createMenuCategory(input: unknown) {
  try {
    const actor = await requireCan("manageMenu");

    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { name, tracksStockDirectly } = parsed.data;

    const taken = await prisma.menuCategory.findUnique({ where: { name } });
    if (taken) return fail("That category already exists.");

    const last = await prisma.menuCategory.findFirst({ orderBy: { sortOrder: "desc" } });
    const created = await prisma.menuCategory.create({
      data: { name, sortOrder: (last?.sortOrder ?? 0) + 1, tracksStockDirectly },
    });

    await logActivity({
      actor,
      area: "MENU",
      action: "CREATE",
      targetName: created.name,
      targetId: created.id,
      detail: tracksStockDirectly
        ? "Menu category added · items counted by hand"
        : "Menu category added",
    });

    revalidateMenuViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to add the category.");
  }
}

/**
 * Archives or restores a category. Archiving cascades: every item in the
 * category is archived too, so nothing is left stranded on the customer menu
 * under a category that no longer shows. Restoring only brings the category
 * back — its items stay archived and can be restored individually, so an item
 * that was meant to stay off the menu isn't silently republished.
 */
export async function setMenuCategoryArchived(id: string, archived: boolean) {
  try {
    const actor = await requireCan("manageMenu");

    const category = await prisma.menuCategory.findUnique({
      where: { id },
      select: { name: true },
    });

    let cascaded = 0;
    if (archived) {
      cascaded = await prisma.menuItem.count({
        where: { categoryId: id, status: { not: "ARCHIVED" } },
      });
      await prisma.$transaction([
        prisma.menuCategory.update({ where: { id }, data: { archivedAt: new Date() } }),
        prisma.menuItem.updateMany({
          where: { categoryId: id, status: { not: "ARCHIVED" } },
          data: { status: "ARCHIVED" },
        }),
      ]);
    } else {
      await prisma.menuCategory.update({ where: { id }, data: { archivedAt: null } });
    }

    await logActivity({
      actor,
      area: "MENU",
      action: archived ? "ARCHIVE" : "RESTORE",
      targetName: category?.name ?? "Menu category",
      targetId: id,
      detail: archived
        ? `Category archived${cascaded > 0 ? ` · ${cascaded} item${cascaded === 1 ? "" : "s"} archived with it` : ""}`
        : "Category restored",
    });

    revalidateMenuViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update the category.");
  }
}

/**
 * Replaces an item's recipe with exactly what the form submitted: every line
 * (across every variation, or the flat base set) goes in, and anything already
 * on file goes out. Whole-replace keeps the write simple — a variation that was
 * renamed or removed takes its ingredient lines with it, and nothing stale
 * survives a save.
 */
function recipeWrites(menuItemId: string, d: z.infer<typeof itemSchema>) {
  const lines = recipeLines(d);
  return [
    prisma.recipeItem.deleteMany({ where: { menuItemId } }),
    ...(lines.length > 0
      ? [prisma.recipeItem.createMany({ data: lines.map((line) => ({ ...line, menuItemId })) })]
      : []),
  ];
}

/**
 * The exact recipe lines a save should leave in the database.
 *
 * A variation item gets one set per variation label; a plain item gets one
 * unlabelled set (""), and a DIRECT item gets none — its count is the stock.
 * Where the same ingredient slipped into a variation twice, the later line
 * wins: it is what the person last picked in the form.
 */
function recipeLines(d: z.infer<typeof itemSchema>) {
  if (d.stockMode === "DIRECT") return [];

  const lines: { variationLabel: string; inventoryItemId: string; quantity: number }[] = [];
  const sets: { label: string; ingredients: z.infer<typeof recipeSchema>[] }[] =
    d.variations.length > 0
      ? d.variations.map((v) => ({ label: v.label, ingredients: v.ingredients }))
      : [{ label: "", ingredients: d.recipe }];

  for (const set of sets) {
    for (const line of set.ingredients) {
      const dup = lines.findIndex(
        (l) => l.variationLabel === set.label && l.inventoryItemId === line.inventoryItemId
      );
      if (dup !== -1) lines.splice(dup, 1);
      lines.push({
        variationLabel: set.label,
        inventoryItemId: line.inventoryItemId,
        quantity: line.quantity,
      });
    }
  }
  return lines;
}

async function itemData(d: z.infer<typeof itemSchema>) {
  const lines = recipeLines(d);

  const ingredients = await prisma.inventoryItem.findMany({
    where: { id: { in: [...new Set(lines.map((line) => line.inventoryItemId))] } },
    select: { id: true, ingredientName: true, unit: true },
  });
  const byId = new Map(ingredients.map((i) => [i.id, i]));

  // The customer menu still shows a plain ingredient list, so anything with
  // recipe lines gets that list written from them rather than typed separately —
  // one source of truth, and the two can never drift apart. For a variation item
  // the union of every variation's lines is shown, deduped by label string.
  const labels = [...new Set(lines.map((line) => {
    const ingredient = byId.get(line.inventoryItemId);
    return ingredient
      ? `${ingredient.ingredientName} (${line.quantity}${ingredient.unit})`
      : "Unknown ingredient";
  }))];

  return {
    name: d.name,
    description: d.description || null,
    categoryId: d.categoryId,
    price: d.price,
    originalPrice: d.originalPrice ?? null,
    isPromo: d.isPromo,
    isRecommended: d.isRecommended,
    imageUrl: d.imageUrl || null,
    stockMode: d.stockMode,
    // The count only means anything for a DIRECT item. Zeroing it on a RECIPE
    // item keeps the column from holding a stale number that would spring back
    // to life if someone later flipped the mode.
    stockQuantity: d.stockMode === "DIRECT" ? d.stockQuantity : 0,
    lowStockAt: d.stockMode === "DIRECT" ? d.lowStockAt : 0,
    unitLabel: d.unitLabel || "pcs",
    // Recipe wins when there is one — the same precedence the rest of the app
    // uses. Only a recipe-less item keeps what was typed into the form.
    ingredients: labels.length > 0 ? labels : (d.ingredients ?? []),
    hasVariation: d.variations.length > 0,
    variations: d.variations.length > 0 ? d.variations.map(({ label, price }) => ({ label, price })) : undefined,
  };
}

export async function createMenuItem(input: unknown) {
  try {
    const actor = await requireCan("manageMenu");

    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    // Two variations with the same label would collide in the recipe table and
    // make order-price lookups ambiguous — the form prevents it, this enforces it.
    const labels = parsed.data.variations.map((v) => v.label);
    if (new Set(labels).size !== labels.length) {
      return fail("Variation names must be different from each other.");
    }

    const lines = recipeLines(parsed.data);
    const item = await prisma.menuItem.create({ data: await itemData(parsed.data) });
    if (lines.length > 0) {
      await prisma.recipeItem.createMany({
        data: lines.map((line) => ({ ...line, menuItemId: item.id })),
      });
    }

    await logActivity({
      actor,
      area: "MENU",
      action: "CREATE",
      targetName: item.name,
      targetId: item.id,
      detail:
        parsed.data.stockMode === "DIRECT"
          ? `${peso(item.price)} · counted by hand · ${item.stockQuantity} ${item.unitLabel} on hand`
          : `${peso(item.price)} · ${
              parsed.data.variations.length > 0
                ? `${parsed.data.variations.length} variation${parsed.data.variations.length === 1 ? "" : "s"} · `
                : ""
            }${lines.length} recipe line${lines.length === 1 ? "" : "s"}`,
    });

    revalidateMenuViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to add the item.");
  }
}

export async function updateMenuItem(id: string, input: unknown) {
  try {
    const actor = await requireCan("manageMenu");

    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    // Two variations with the same label would collide in the recipe table and
    // make order-price lookups ambiguous — the form prevents it, this enforces it.
    const labels = parsed.data.variations.map((v) => v.label);
    if (new Set(labels).size !== labels.length) {
      return fail("Variation names must be different from each other.");
    }

    // Snapshot the fields worth reporting before they change.
    const before = await prisma.menuItem.findUnique({
      where: { id },
      select: { name: true, price: true, isPromo: true, stockMode: true, stockQuantity: true },
    });

    await prisma.$transaction([
      prisma.menuItem.update({ where: { id }, data: await itemData(parsed.data) }),
      ...recipeWrites(id, parsed.data),
    ]);

    const changes: string[] = [];
    if (before && before.name !== parsed.data.name) changes.push(`${before.name} → ${parsed.data.name}`);
    if (before && before.price !== parsed.data.price) {
      changes.push(`${peso(before.price)} → ${peso(parsed.data.price)}`);
    }
    if (before && before.isPromo !== parsed.data.isPromo) {
      changes.push(parsed.data.isPromo ? "Marked as promo" : "Promo removed");
    }
    // Switching how an item is tracked clears the other side's data, so it is
    // worth naming on the feed rather than hiding under "Details updated".
    if (before && before.stockMode !== parsed.data.stockMode) {
      changes.push(
        parsed.data.stockMode === "DIRECT"
          ? "Now counted by hand — recipe cleared"
          : "Now ingredient-based — count cleared"
      );
    } else if (
      before &&
      parsed.data.stockMode === "DIRECT" &&
      before.stockQuantity !== parsed.data.stockQuantity
    ) {
      changes.push(
        `Stock ${before.stockQuantity} → ${parsed.data.stockQuantity} ${parsed.data.unitLabel}`
      );
    }

    await logActivity({
      actor,
      area: "MENU",
      action: "UPDATE",
      targetName: parsed.data.name,
      targetId: id,
      detail: changes.length > 0 ? changes.join(" · ") : "Details updated",
    });

    revalidateMenuViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update the item.");
  }
}

/**
 * Removes an item for good. Safe to do unconditionally: its recipe lines are
 * ON DELETE CASCADE, and orders store a JSON snapshot of what was sold rather
 * than a foreign key — so past receipts, transactions and sales totals are
 * untouched. The item does drop out of the Reports product filter.
 *
 * UNUSED as of 2026-08-06: the client removed the Delete button from the Menu
 * screen, leaving Archive as the only way to take an item off the menu. Kept
 * (guarded and logged) so restoring the button is a one-line change — the same
 * convention `adjustStock` / `recordWastage` follow in inventory.ts.
 */
export async function deleteMenuItem(id: string) {
  try {
    const actor = await requireCan("manageMenu");

    // Read the name before it goes, so the feed can say what was deleted.
    const item = await prisma.menuItem.findUnique({ where: { id }, select: { name: true } });

    await prisma.menuItem.delete({ where: { id } });

    await logActivity({
      actor,
      area: "MENU",
      action: "DELETE",
      targetName: item?.name ?? "Menu item",
      targetId: id,
      detail: "Menu item deleted",
    });

    revalidateMenuViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to delete the item.");
  }
}

/** Archiving takes an item off the customer menu without deleting its history. */
export async function setMenuItemArchived(id: string, archived: boolean) {
  try {
    const actor = await requireCan("manageMenu");

    const item = await prisma.menuItem.update({
      where: { id },
      data: { status: archived ? "ARCHIVED" : "AVAILABLE" },
    });

    await logActivity({
      actor,
      area: "MENU",
      action: archived ? "ARCHIVE" : "RESTORE",
      targetName: item.name,
      targetId: id,
      detail: archived ? "Taken off the menu" : "Put back on the menu",
    });

    revalidateMenuViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update the item.");
  }
}
