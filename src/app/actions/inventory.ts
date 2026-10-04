"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireCan } from "@/lib/guards";
import { computeStatus, menuAvailability } from "@/lib/availability";
import { logActivity, changeDetail, deltaDetail } from "@/lib/activity";
import { stockCountStatus, STOCK_COUNT_MAX, type StockCountedRow } from "@/lib/stock-counted";
import type { Prisma, StockMovementType } from "@prisma/client";

const categorySchema = z.object({
  name: z.string().trim().min(2, "Category name is too short.").max(40),
  /// Which prep area stocks this category — the Bar/Kitchen split (2026-09-13).
  station: z.enum(["BAR", "KITCHEN"]).default("KITCHEN"),
});

const itemSchema = z.object({
  ingredientName: z.string().trim().min(2, "Name is too short.").max(80),
  categoryId: z.string().min(1, "Pick a category."),
  stockQuantity: z.number().min(0, "Stock cannot be negative.").max(1_000_000),
  unit: z.string().trim().min(1, "Unit is required.").max(12),
  reorderLevel: z.number().min(0).max(1_000_000),
  supplier: z.string().trim().max(80).optional().or(z.literal("")),
  expiryDate: z.string().optional().or(z.literal("")),
});

/** Manual correction / wastage / spoilage of stock. */
const adjustSchema = z.object({
  inventoryItemId: z.string().min(1),
  mode: z.enum(["ADD", "REMOVE", "SET"]),
  quantity: z.number().min(0, "Quantity cannot be negative.").max(1_000_000),
  reason: z.string().trim().max(160).optional().or(z.literal("")),
});

const wastageSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.number().positive("Quantity must be greater than zero.").max(1_000_000),
  reason: z.string().trim().max(160).optional().or(z.literal("")),
});

const recipeLineSchema = z.object({
  menuItemId: z.string().min(1, "Pick a menu item."),
  inventoryItemId: z.string().min(1, "Pick an ingredient."),
  /** Which variation of the item this line feeds. "" for items with no
   *  variations; a labelled line must name a variation the item actually has. */
  variationLabel: z.string().max(30).optional(),
  quantity: z
    .number()
    .positive("Quantity must be greater than zero.")
    .max(1_000_000),
});

function revalidateInventoryViews() {
  for (const role of ["supervisor", "owner"]) {
    revalidatePath(`/staff/${role}/inventory`);
    revalidatePath(`/staff/${role}/inventory/history`);
    revalidatePath(`/staff/${role}/inventory/alerts`);
    revalidatePath(`/staff/${role}`);
  }
  revalidatePath("/staff/admin");
  // Recipes and stock levels decide what the customer can still order.
  revalidatePath("/menu");
  revalidatePath("/");
}

function fail(error: string) {
  return { success: false as const, error };
}

/** The live ingredients — or only the archived ones. */
export async function getInventory(archived = false) {
  const items = await prisma.inventoryItem.findMany({
    where: { archivedAt: archived ? { not: null } : null },
    include: { category: true, updatedBy: { select: { name: true } } },
    orderBy: { ingredientName: "asc" },
  });

  return items.map((item) => ({
    id: item.id,
    ingredientName: item.ingredientName,
    categoryId: item.categoryId,
    categoryName: item.category.name,
    stockQuantity: item.stockQuantity,
    unit: item.unit,
    reorderLevel: item.reorderLevel,
    supplier: item.supplier ?? "",
    expiryDate: item.expiryDate,
    status: item.status,
    updatedBy: item.updatedBy?.name ?? "—",
  }));
}

/** The live categories — or only the archived ones. */
export async function getInventoryCategories(archived = false) {
  return prisma.inventoryCategory.findMany({
    where: { archivedAt: archived ? { not: null } : null },
    orderBy: { name: "asc" },
  });
}

export async function createInventoryCategory(input: unknown) {
  try {
    const actor = await requireCan("manageInventory");

    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    const taken = await prisma.inventoryCategory.findUnique({
      where: { name: parsed.data.name },
    });
    if (taken) return fail("That category already exists.");

    const created = await prisma.inventoryCategory.create({
      data: { name: parsed.data.name, station: parsed.data.station },
    });

    await logActivity({
      actor,
      area: "INVENTORY",
      action: "CREATE",
      targetName: created.name,
      targetId: created.id,
      detail: `Ingredient category added (${created.station === "BAR" ? "Bar" : "Kitchen"})`,
    });

    revalidateInventoryViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to add the category.");
  }
}

/**
 * Retires a category so it drops out of the filters and the ingredient form.
 * Unlike setMenuCategoryArchived this deliberately does NOT cascade: recipes
 * depend on ingredients, and setInventoryItemArchived refuses while they do, so
 * archiving a category out from under them is refused too — its ingredients have
 * to be archived first, one deliberate act at a time.
 */
export async function setInventoryCategoryArchived(id: string, archived: boolean) {
  try {
    const actor = await requireCan("manageInventory");

    const category = await prisma.inventoryCategory.findUnique({
      where: { id },
      select: { name: true },
    });
    if (!category) return fail("Category not found.");

    if (archived) {
      const live = await prisma.inventoryItem.count({
        where: { categoryId: id, archivedAt: null },
      });
      if (live > 0) {
        return fail(
          `This category still has ${live} active ingredient${live === 1 ? "" : "s"}. Archive them first.`
        );
      }
    }

    await prisma.inventoryCategory.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });

    await logActivity({
      actor,
      area: "INVENTORY",
      action: archived ? "ARCHIVE" : "RESTORE",
      targetName: category.name,
      targetId: id,
      detail: archived ? "Ingredient category archived" : "Ingredient category restored",
    });

    revalidateInventoryViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update the category.");
  }
}

export async function createInventoryItem(input: unknown) {
  try {
    const actor = await requireCan("manageInventory");

    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const d = parsed.data;

    const data = {
      ingredientName: d.ingredientName,
      categoryId: d.categoryId,
      stockQuantity: d.stockQuantity,
      unit: d.unit,
      reorderLevel: d.reorderLevel,
      supplier: d.supplier || null,
      expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
      status: computeStatus(d.stockQuantity, d.reorderLevel),
      updatedById: actor.id,
    };

    const item = await prisma.inventoryItem.create({ data });

    // Opening stock is a delivery like any other: a STOCK_IN ledger row so the
    // item has a starting point, and a StockPurchase so the supplier shows up on
    // the Suppliers page and in "Most Restocked". Booking only the ledger row
    // was the reason a brand-new ingredient's supplier stayed invisible until
    // someone edited the item to raise its stock — the only other writer.
    if (d.stockQuantity > 0) {
      await prisma.$transaction([
        prisma.stockMovement.create({
          data: {
            inventoryItemId: item.id,
            type: "STOCK_IN",
            change: d.stockQuantity,
            before: 0,
            after: d.stockQuantity,
            reason: "Opening stock",
            createdById: actor.id,
          },
        }),
        prisma.stockPurchase.create({
          data: {
            inventoryItemId: item.id,
            quantity: d.stockQuantity,
            unitCost: 0,
            totalCost: 0,
            supplier: data.supplier,
            purchasedById: actor.id,
          },
        }),
      ]);
    }

    await logActivity({
      actor,
      area: "INVENTORY",
      action: "CREATE",
      targetName: item.ingredientName,
      targetId: item.id,
      detail: `Opening stock ${deltaDetail(d.stockQuantity, d.unit)}`,
    });

    revalidateInventoryViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to add the ingredient.");
  }
}

/**
 * Edits an ingredient — and, since Edit is now the single way stock changes by
 * hand, records what that did to the stock. Raising it is a delivery: a STOCK_IN
 * ledger row plus a StockPurchase, which is what keeps the Suppliers page and
 * "Most Purchased" fed. Lowering it is a correction, logged as an ADJUSTMENT.
 * Editing only the details touches neither.
 */
export async function updateInventoryItem(id: string, input: unknown) {
  try {
    const actor = await requireCan("manageInventory");

    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const d = parsed.data;

    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) return fail("Ingredient not found.");

    const supplier = d.supplier || null;
    const delta = d.stockQuantity - item.stockQuantity;

    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.inventoryItem.update({
        where: { id },
        data: {
          ingredientName: d.ingredientName,
          categoryId: d.categoryId,
          stockQuantity: d.stockQuantity,
          unit: d.unit,
          reorderLevel: d.reorderLevel,
          supplier,
          expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
          status: computeStatus(d.stockQuantity, d.reorderLevel),
          updatedById: actor.id,
        },
      }),
    ];

    if (delta !== 0) {
      writes.push(
        prisma.stockMovement.create({
          data: {
            inventoryItemId: id,
            type: delta > 0 ? "STOCK_IN" : "ADJUSTMENT",
            change: delta,
            before: item.stockQuantity,
            after: d.stockQuantity,
            reason: delta > 0 ? "Stock added via edit" : "Corrected via edit",
            createdById: actor.id,
          },
        })
      );
    }

    if (delta > 0) {
      writes.push(
        prisma.stockPurchase.create({
          data: {
            inventoryItemId: id,
            quantity: delta,
            unitCost: 0,
            totalCost: 0,
            supplier: supplier ?? item.supplier,
            purchasedById: actor.id,
          },
        })
      );
    }

    await prisma.$transaction(writes);

    const deliveredBy = delta > 0 ? (supplier ?? item.supplier) : null;
    await logActivity({
      actor,
      area: "INVENTORY",
      action: delta > 0 ? "STOCK_IN" : delta < 0 ? "ADJUST" : "UPDATE",
      targetName: d.ingredientName,
      targetId: id,
      detail:
        delta === 0
          ? "Details updated"
          : `${deltaDetail(delta, d.unit)} · ${changeDetail(item.stockQuantity, d.stockQuantity, d.unit)}` +
            (deliveredBy ? ` · ${deliveredBy}` : ""),
    });

    revalidateInventoryViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update the ingredient.");
  }
}

/**
 * The menu items whose recipes call for this ingredient. Both removing and
 * archiving an ingredient are refused while any of them exist — otherwise the
 * ingredient would keep deciding, invisibly, whether those dishes can be sold.
 */
async function recipeDependents(inventoryItemId: string) {
  const lines = await prisma.recipeItem.findMany({
    where: { inventoryItemId },
    select: { menuItem: { select: { name: true } } },
  });
  return lines.map((line) => line.menuItem.name);
}

function usedInRecipesError(name: string, dependents: string[]) {
  const shown = dependents.slice(0, 3).join(", ");
  const rest = dependents.length > 3 ? ` and ${dependents.length - 3} more` : "";
  return `${name} is used by ${shown}${rest}. Remove it from those recipes first.`;
}

/**
 * Retires an ingredient. This replaced the old hard delete entirely: recipe
 * lines, deliveries and ledger rows all point at an ingredient with a required
 * foreign key, so anything with history could never be deleted anyway — and
 * archiving keeps the trail intact.
 */
export async function setInventoryItemArchived(id: string, archived: boolean) {
  try {
    const actor = await requireCan("manageInventory");

    const item = await prisma.inventoryItem.findUnique({
      where: { id },
      select: { ingredientName: true },
    });
    if (!item) return fail("Ingredient not found.");

    if (archived) {
      const dependents = await recipeDependents(id);
      if (dependents.length > 0) {
        return fail(usedInRecipesError(item.ingredientName, dependents));
      }
    }

    await prisma.inventoryItem.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });

    await logActivity({
      actor,
      area: "INVENTORY",
      action: archived ? "ARCHIVE" : "RESTORE",
      targetName: item.ingredientName,
      targetId: id,
      detail: archived ? "Ingredient archived" : "Ingredient restored",
    });

    revalidateInventoryViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update the ingredient.");
  }
}

/** Apply a stock change and log it to the ledger, in one transaction. */
async function applyMovement(params: {
  inventoryItemId: string;
  before: number;
  after: number;
  reorderLevel: number;
  type: StockMovementType;
  reason?: string | null;
  actorId: string;
}) {
  const { inventoryItemId, before, after, reorderLevel, type, reason, actorId } = params;
  await prisma.$transaction([
    prisma.inventoryItem.update({
      where: { id: inventoryItemId },
      data: {
        stockQuantity: after,
        status: computeStatus(after, reorderLevel),
        updatedById: actorId,
      },
    }),
    prisma.stockMovement.create({
      data: {
        inventoryItemId,
        type,
        change: after - before,
        before,
        after,
        reason: reason || null,
        createdById: actorId,
      },
    }),
  ]);
}

/**
 * Manual stock correction. ADD/REMOVE nudge the count; SET replaces it (a
 * physical stocktake). Stock never goes below zero. Logged as an ADJUSTMENT.
 */
export async function adjustStock(input: unknown) {
  try {
    const actor = await requireCan("manageInventory");

    const parsed = adjustSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { inventoryItemId, mode, quantity, reason } = parsed.data;

    const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item) return fail("Ingredient not found.");

    const before = item.stockQuantity;
    const after =
      mode === "ADD"
        ? before + quantity
        : mode === "REMOVE"
          ? Math.max(0, before - quantity)
          : quantity; // SET
    if (after === before) return fail("That leaves the stock unchanged.");

    await applyMovement({
      inventoryItemId,
      before,
      after,
      reorderLevel: item.reorderLevel,
      type: "ADJUSTMENT",
      reason,
      actorId: actor.id,
    });

    await logActivity({
      actor,
      area: "INVENTORY",
      action: "ADJUST",
      targetName: item.ingredientName,
      targetId: inventoryItemId,
      detail:
        `${deltaDetail(after - before, item.unit)} · ${changeDetail(before, after, item.unit)}` +
        (reason ? ` · ${reason}` : ""),
    });

    revalidateInventoryViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to adjust the stock.");
  }
}

/** Spoilage / damage / discard — always a deduction, floored at zero. */
export async function recordWastage(input: unknown) {
  try {
    const actor = await requireCan("manageInventory");

    const parsed = wastageSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { inventoryItemId, quantity, reason } = parsed.data;

    const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item) return fail("Ingredient not found.");
    if (item.stockQuantity <= 0) return fail("There is no stock to write off.");

    const before = item.stockQuantity;
    const after = Math.max(0, before - quantity);

    await applyMovement({
      inventoryItemId,
      before,
      after,
      reorderLevel: item.reorderLevel,
      type: "WASTAGE",
      reason,
      actorId: actor.id,
    });

    await logActivity({
      actor,
      area: "INVENTORY",
      action: "WASTAGE",
      targetName: item.ingredientName,
      targetId: inventoryItemId,
      detail: `${deltaDetail(after - before, item.unit)}` + (reason ? ` · ${reason}` : ""),
    });

    revalidateInventoryViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to record the wastage.");
  }
}

/** Marks an ingredient as expired: zeroes the stock and logs it as EXPIRY. */
export async function markExpired(inventoryItemId: string, reason?: string) {
  try {
    const actor = await requireCan("manageInventory");

    const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item) return fail("Ingredient not found.");
    if (item.stockQuantity <= 0) return fail("That ingredient is already at zero stock.");

    await applyMovement({
      inventoryItemId,
      before: item.stockQuantity,
      after: 0,
      reorderLevel: item.reorderLevel,
      type: "EXPIRY",
      reason: reason?.trim() || "Marked expired",
      actorId: actor.id,
    });

    await logActivity({
      actor,
      area: "INVENTORY",
      action: "EXPIRY",
      targetName: item.ingredientName,
      targetId: inventoryItemId,
      detail: `${deltaDetail(-item.stockQuantity, item.unit)} · ${reason?.trim() || "Marked expired"}`,
    });

    revalidateInventoryViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to mark as expired.");
  }
}

const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  STOCK_IN: "Stock In",
  SALES_IMPORT: "Sales Import",
  ADJUSTMENT: "Adjustment",
  WASTAGE: "Wastage",
  EXPIRY: "Expiry",
};

/** Recent ledger rows for the Stock History page. */
export async function getStockMovements(filters?: {
  inventoryItemId?: string;
  type?: StockMovementType;
  limit?: number;
}) {
  await requireCan("viewInventory");

  const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 500);
  const movements = await prisma.stockMovement.findMany({
    where: {
      inventoryItemId: filters?.inventoryItemId || undefined,
      type: filters?.type || undefined,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      inventoryItem: { select: { ingredientName: true, unit: true } },
      createdBy: { select: { name: true } },
    },
  });

  return movements.map((m) => ({
    id: m.id,
    ingredientName: m.inventoryItem.ingredientName,
    unit: m.inventoryItem.unit,
    type: m.type,
    typeLabel: MOVEMENT_LABEL[m.type],
    change: m.change,
    before: m.before,
    after: m.after,
    reason: m.reason ?? "",
    by: m.createdBy?.name ?? "—",
    createdAt: m.createdAt.toISOString(),
  }));
}

/** Live ingredients at or below their reorder level — the shopping list. */
export async function getReorderList() {
  await requireCan("viewInventory");

  const items = await prisma.inventoryItem.findMany({
    where: { archivedAt: null, status: { in: ["LOW", "OUT_OF_STOCK"] } },
    include: { category: true },
  });

  return items
    .map((i) => ({
      id: i.id,
      ingredientName: i.ingredientName,
      categoryName: i.category.name,
      stockQuantity: i.stockQuantity,
      reorderLevel: i.reorderLevel,
      unit: i.unit,
      supplier: i.supplier ?? "",
      status: i.status,
      // Suggest topping up to twice the reorder level — a simple, explainable
      // buffer above the danger line.
      suggestedOrder: Math.max(
        0,
        Math.round((i.reorderLevel * 2 - i.stockQuantity) * 100) / 100
      ),
    }))
    // Out of stock first, then lowest headroom.
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "OUT_OF_STOCK" ? -1 : 1;
      return a.stockQuantity - a.reorderLevel - (b.stockQuantity - b.reorderLevel);
    });
}

/** Live ingredients expiring within `days` days (already-expired included). */
export async function getExpiringSoon(days = 7) {
  await requireCan("viewInventory");

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  const items = await prisma.inventoryItem.findMany({
    where: { archivedAt: null, expiryDate: { not: null, lte: cutoff } },
    orderBy: { expiryDate: "asc" },
    include: { category: true },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return items.map((i) => {
    const expiry = i.expiryDate as Date;
    const daysLeft = Math.round((expiry.getTime() - startOfToday.getTime()) / 86_400_000);
    return {
      id: i.id,
      ingredientName: i.ingredientName,
      categoryName: i.category.name,
      stockQuantity: i.stockQuantity,
      unit: i.unit,
      expiryDate: expiry.toISOString().slice(0, 10),
      daysLeft,
      expired: daysLeft < 0,
    };
  });
}

/**
 * Every sellable menu item with its recipe and how many servings the ingredients
 * on hand can still produce. This is the "detect out of stock" view: a recipe
 * item with canMake 0 cannot be sold until someone restocks.
 */
export async function getRecipes() {
  const items = await prisma.menuItem.findMany({
    where: { status: { not: "ARCHIVED" } },
    include: {
      category: true,
      recipe: {
        include: { inventoryItem: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    categoryName: item.category.name,
    // Spread first — the availability it computes carries a `variations` field
    // whose name must not collide with the menu item's variation JSON below.
    ...menuAvailability(item),
    // The item's variation labels (from its variations JSON) — the availability
    // spread above already carries the per-variation makeable counts.
    variationLabels: ((item.variations as { label: string }[] | null) ?? []).map((v) => v.label),
    lines: item.recipe.map((line) => ({
      id: line.id,
      variationLabel: line.variationLabel,
      inventoryItemId: line.inventoryItemId,
      ingredientName: line.inventoryItem.ingredientName,
      unit: line.inventoryItem.unit,
      stockQuantity: line.inventoryItem.stockQuantity,
      quantity: line.quantity,
      // Servings this one ingredient allows — the smallest of these is canMake.
      servings: Math.floor(line.inventoryItem.stockQuantity / line.quantity),
    })),
  }));
}

// ─── Stock-counted items ────────────────────────────────────────────────────
// Finished goods (bread, donuts, bottled drinks) whose MenuItem.stockMode is
// DIRECT. They are MenuItems, not InventoryItems, so they are created and priced
// on the Menu screen — this tab only owns the counting. Note the ledger cannot
// hold them: StockMovement.inventoryItemId is a non-null FK to InventoryItem, so
// their audit trail is ActivityLog instead.

/** Every counted item across all categories, newest-updated last. */
export async function getStockCountedItems(archived = false): Promise<StockCountedRow[]> {
  await requireCan("viewInventory");

  const items = await prisma.menuItem.findMany({
    where: {
      stockMode: "DIRECT",
      status: archived ? "ARCHIVED" : { not: "ARCHIVED" },
    },
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: item.category.name,
    unitLabel: item.unitLabel,
    stockCount: item.stockQuantity,
    lowStockAt: item.lowStockAt,
    status: stockCountStatus(item.stockQuantity, item.lowStockAt),
    updatedAt: item.updatedAt.toISOString(),
  }));
}

const stockCountSchema = z.object({
  unitLabel: z.string().trim().min(1, "Choose a unit.").max(20),
  stockCount: z
    .number()
    .int("Stock must be a whole number.")
    .min(0, "Stock cannot be negative.")
    .max(STOCK_COUNT_MAX, "Stock is too large."),
  lowStockAt: z
    .number()
    .int("Low-stock level must be a whole number.")
    .min(0, "Low-stock level cannot be negative.")
    .max(STOCK_COUNT_MAX, "Low-stock level is too large."),
});

/**
 * The physical count and the two settings behind it. Name, price and category
 * belong to the Menu screen — changing them here would mean two places to look
 * when a menu item is wrong.
 */
export async function updateStockCount(id: string, input: unknown) {
  try {
    const actor = await requireCan("manageInventory");

    const parsed = stockCountSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const d = parsed.data;

    const before = await prisma.menuItem.findUnique({
      where: { id },
      select: { name: true, stockMode: true, stockQuantity: true, unitLabel: true },
    });
    if (!before) return fail("Item not found.");
    if (before.stockMode !== "DIRECT") {
      return fail("That item is tracked by its recipe, so it has no count to set.");
    }

    await prisma.menuItem.update({
      where: { id },
      data: { stockQuantity: d.stockCount, lowStockAt: d.lowStockAt, unitLabel: d.unitLabel },
    });

    const delta = d.stockCount - before.stockQuantity;
    await logActivity({
      actor,
      area: "INVENTORY",
      action: delta > 0 ? "STOCK_IN" : delta < 0 ? "ADJUST" : "UPDATE",
      targetName: before.name,
      targetId: id,
      detail:
        delta === 0
          ? `Count settings updated · low at ${d.lowStockAt} ${d.unitLabel}`
          : `${deltaDetail(delta, d.unitLabel)} · now ${d.stockCount} ${d.unitLabel}`,
    });

    revalidateInventoryViews();
    for (const role of ["supervisor", "owner", "admin"]) {
      revalidatePath(`/staff/${role}/menu`);
    }
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to update the count.");
  }
}

/** Add an ingredient to a recipe, or change how much of it one serving uses. */
export async function setRecipeLine(input: unknown) {
  try {
    const actor = await requireCan("manageInventory");

    const parsed = recipeLineSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const { menuItemId, inventoryItemId, variationLabel, quantity } = parsed.data;

    // A labelled line must belong to a variation the item actually offers, or
    // the label would be stranded in the recipe with nothing to match it on
    // sale day. A "" label belongs to items with no variations at all.
    const target = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      select: { hasVariation: true, variations: true },
    });
    if (!target) return fail("Menu item not found.");
    let label = "";
    if (target.hasVariation) {
      const labels = ((target.variations as { label: string }[] | null) ?? []).map(
        (v) => v.label
      );
      const wanted = variationLabel ?? "";
      if (!labels.includes(wanted)) {
        return fail(wanted
          ? `"${wanted}" is not a variation of this item anymore — refresh and try again.`
          : "Pick which variation this ingredient is for.");
      }
      label = wanted;
    }

    await prisma.recipeItem.upsert({
      where: {
        menuItemId_variationLabel_inventoryItemId: {
          menuItemId,
          variationLabel: label,
          inventoryItemId,
        },
      },
      update: { quantity },
      create: { menuItemId, inventoryItemId, quantity, variationLabel: label },
    });

    const [itemName, ingredient] = await Promise.all([
      prisma.menuItem.findUnique({ where: { id: menuItemId }, select: { name: true } }),
      prisma.inventoryItem.findUnique({
        where: { id: inventoryItemId },
        select: { ingredientName: true, unit: true },
      }),
    ]);

    await logActivity({
      actor,
      area: "RECIPE",
      action: "UPDATE",
      targetName: itemName?.name ?? "Recipe",
      targetId: menuItemId,
      detail: `${ingredient?.ingredientName ?? "Ingredient"} set to ${quantity} ${ingredient?.unit ?? ""}`.trim(),
    });

    revalidateInventoryViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to save the recipe.");
  }
}

export async function removeRecipeLine(id: string) {
  try {
    const actor = await requireCan("manageInventory");

    // Read the names before the row goes, so the feed can say what was removed.
    const line = await prisma.recipeItem.findUnique({
      where: { id },
      select: {
        menuItemId: true,
        menuItem: { select: { name: true } },
        inventoryItem: { select: { ingredientName: true } },
      },
    });

    await prisma.recipeItem.delete({ where: { id } });

    await logActivity({
      actor,
      area: "RECIPE",
      action: "DELETE",
      targetName: line?.menuItem.name ?? "Recipe",
      targetId: line?.menuItemId,
      detail: `Removed ${line?.inventoryItem.ingredientName ?? "an ingredient"} from the recipe`,
    });

    revalidateInventoryViews();
    return { success: true as const };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to remove the ingredient.");
  }
}
