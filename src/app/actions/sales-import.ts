"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireCan } from "@/lib/guards";
import { computeStatus, ingredientDraw, recipeForVariation, type RecipeLine } from "@/lib/availability";
import { parseImportDetails } from "@/lib/import-details";
import { activityData } from "@/lib/activity";

/** How the day's sales feed the inventory: parse an Excel of products sold and
 *  deduct each product's recipe from ingredient stock. Mirrors payOrder's
 *  deduction (read outside the transaction, one batched $transaction write). */

const MAX_ROWS = 2000;

export type PreviewRowStatus =
  | "matched"
  | "no-recipe"
  | "unmatched"
  | "ambiguous"
  | "needs-variation"
  | "bad-variation"
  | "bad-qty";

export type PreviewRow = {
  rowNumber: number;
  product: string;
  /** The Variation cell, as typed. Blank on sheets without the column. */
  variation?: string;
  qty: number | null;
  status: PreviewRowStatus;
  menuItemId?: string;
};

/**
 * One line of "what this import takes off the shelf". Usually an ingredient, but
 * a counted menu item draws down its own number instead — same columns, so the
 * preview and the stored log render both without branching.
 */
export type IngredientImpact = {
  /** The InventoryItem id, or the MenuItem id when kind is "item". */
  inventoryItemId: string;
  name: string;
  unit: string;
  deduct: number;
  before: number;
  remaining: number;
  insufficient: boolean;
  /** Absent on rows written before counted items existed — treat as "ingredient". */
  kind?: "ingredient" | "item";
};

export type ApplyLine = { menuItemId: string; qty: number; variation?: string };

export type PreviewResult =
  | { success: false; error: string }
  | {
      success: true;
      fileName: string;
      rows: PreviewRow[];
      apply: ApplyLine[];
      impact: IngredientImpact[];
      totals: { rowCount: number; applied: number; skipped: number; totalUnits: number };
      possibleDuplicate: boolean;
    };

/** trim + lowercase + collapse internal whitespace, so "Iced  Latte " matches "Iced Latte". */
function normalize(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function fail(error: string) {
  return { success: false as const, error };
}

/** Header names we accept for the product column. "Menu Item" is what the
 *  template (and the client's POS sheet) uses; the rest are legacy/alternates. */
const PRODUCT_HEADERS = ["menu item", "product", "item", "name"];
const QTY_HEADERS = ["quantity", "qty", "sold"];
/** Optional column naming which variation sold. Absent on the client's older
 *  sheets — those rows then simply can't deduct variation items. */
const VARIATION_HEADERS = ["variation", "variant", "size", "options"];

/** Locate the header row + the Menu Item/Qty/Variation columns. The template
 *  puts them on row 3 under a title + date banner, so scan a little way down
 *  the sheet. Variation is optional — a sheet without it still imports plain
 *  items fine. */
function findHeader(ws: ExcelJS.Worksheet) {
  const limit = Math.min(ws.rowCount || 0, 10);
  for (let r = 1; r <= limit; r++) {
    const row = ws.getRow(r);
    let productCol = 0;
    let qtyCol = 0;
    let variationCol = 0;
    row.eachCell((cell, col) => {
      const text = normalize(String(cell.text ?? ""));
      if (!productCol && PRODUCT_HEADERS.includes(text)) productCol = col;
      if (!qtyCol && QTY_HEADERS.includes(text)) qtyCol = col;
      if (!variationCol && VARIATION_HEADERS.includes(text)) variationCol = col;
    });
    if (productCol && qtyCol) return { headerRow: r, productCol, qtyCol, variationCol };
  }
  return null;
}

/** The sheet's closing TOTAL row: no product name, "TOTAL" in one of the other
 *  cells, and a SUM in Qty. That SUM is a formula object rather than an empty
 *  cell, so the blank-line guard misses it and it would otherwise be reported as
 *  a bad-quantity row. */
function isTotalRow(row: ExcelJS.Row) {
  let found = false;
  row.eachCell((cell) => {
    const text = normalize(String(cell.text ?? ""));
    if (text === "total" || text === "grand total") found = true;
  });
  return found;
}

export async function previewSalesImport(formData: FormData): Promise<PreviewResult> {
  try {
    await requireCan("manageInventory");

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("Please choose an Excel file.");
    if (file.size > 5_000_000) return fail("That file is too large (max 5MB).");

    const workbook = new ExcelJS.Workbook();
    try {
      // Cast around a Buffer-type mismatch between @types/node and exceljs's param.
      const bytes = Buffer.from(await file.arrayBuffer());
      await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    } catch {
      return fail("Couldn't read that file — please upload a valid .xlsx workbook.");
    }

    const ws = workbook.worksheets[0];
    if (!ws) return fail("The workbook has no sheets.");

    const header = findHeader(ws);
    if (!header) {
      return fail('Missing headers — the sheet needs a "Menu Item" column and a "Qty" column.');
    }

    // Pull the raw (product, variation, qty) triples off the sheet.
    type Raw = { rowNumber: number; product: string; variation: string; qtyRaw: unknown };
    const raw: Raw[] = [];
    for (let r = header.headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const product = String(row.getCell(header.productCol).text ?? "").trim();
      const variation =
        header.variationCol > 0 ? String(row.getCell(header.variationCol).text ?? "").trim() : "";
      const qtyCell = row.getCell(header.qtyCol);
      const qtyRaw = qtyCell.value;
      if (!product && (qtyRaw === null || qtyRaw === undefined || qtyRaw === "")) continue; // blank line
      if (!product && isTotalRow(row)) continue; // the sheet's own TOTAL line
      raw.push({ rowNumber: r, product, variation, qtyRaw });
      if (raw.length > MAX_ROWS) return fail(`Too many rows (limit ${MAX_ROWS}).`);
    }
    if (raw.length === 0) return fail("No data rows found under the headers.");

    // Every sellable product with its recipe, indexed by normalized name.
    const menuItems = await prisma.menuItem.findMany({
      where: { status: { not: "ARCHIVED" } },
      include: { recipe: { include: { inventoryItem: true } } },
    });
    const byName = new Map<string, typeof menuItems>();
    for (const mi of menuItems) {
      const key = normalize(mi.name);
      const list = byName.get(key) ?? [];
      list.push(mi);
      byName.set(key, list);
    }

    const rows: PreviewRow[] = [];
    const apply: ApplyLine[] = [];
    const recipeDraw: { recipe: RecipeLine[]; qty: number }[] = [];
    const ingredientById = new Map<string, RecipeLine["inventoryItem"]>();
    // Counted items are drawn from their own stockQuantity, so they need a
    // separate tally keyed by menu item rather than by ingredient.
    const countedDraw = new Map<string, number>();
    const countedById = new Map<string, (typeof menuItems)[number]>();

    for (const { rowNumber, product, variation, qtyRaw } of raw) {
      const qtyNum = typeof qtyRaw === "number" ? qtyRaw : Number(String(qtyRaw).trim());
      const qty = Number.isFinite(qtyNum) ? qtyNum : null;

      if (!product) {
        rows.push({ rowNumber, product: "", variation, qty, status: "bad-qty" });
        continue;
      }
      if (qty === null || !Number.isInteger(qty) || qty < 1 || qty > 9999) {
        rows.push({ rowNumber, product, variation, qty, status: "bad-qty" });
        continue;
      }

      const matches = byName.get(normalize(product));
      if (!matches || matches.length === 0) {
        rows.push({ rowNumber, product, variation, qty, status: "unmatched" });
        continue;
      }

      // Several menu items may share a name. A variation disambiguates: the item
      // that actually offers that label is the one being sold.
      let candidates = matches;
      if (matches.length > 1 && variation) {
        const labelled = matches.filter(
          (mi) =>
            mi.hasVariation &&
            ((mi.variations as { label: string }[] | null) ?? []).some(
              (v) => normalize(v.label) === normalize(variation)
            )
        );
        if (labelled.length === 1) candidates = labelled;
      }

      if (candidates.length > 1) {
        rows.push({ rowNumber, product, variation, qty, status: "ambiguous" });
        continue;
      }

      const mi = candidates[0];
      const labels = (mi.variations as { label: string }[] | null) ?? [];

      if (mi.hasVariation && labels.length > 0 && !variation) {
        // Per-variation recipes mean the sheet must say which one sold — there
        // is no safe guess, so the row is skipped and shown as needing it.
        rows.push({ rowNumber, product, variation, qty, status: "needs-variation", menuItemId: mi.id });
        continue;
      }

      // A variation was named: it must be one the item actually offers, and the
      // item must have ingredient lines for it.
      let resolvedVariation = "";
      if (mi.hasVariation && variation) {
        const label = labels.find((v) => normalize(v.label) === normalize(variation))?.label;
        if (!label) {
          rows.push({ rowNumber, product, variation, qty, status: "bad-variation", menuItemId: mi.id });
          continue;
        }
        resolvedVariation = label;
      }
      const linesForVariation = recipeForVariation(mi.recipe, resolvedVariation);

      // Only a recipe-based item with no recipe is a genuine gap. A counted one
      // is meant to have none — it deducts its own number instead.
      if (mi.stockMode !== "DIRECT" && linesForVariation.length === 0) {
        rows.push({ rowNumber, product, variation, qty, status: "no-recipe", menuItemId: mi.id });
        continue;
      }

      rows.push({
        rowNumber,
        product,
        variation: resolvedVariation,
        qty,
        status: "matched",
        menuItemId: mi.id,
      });
      apply.push({ menuItemId: mi.id, variation: resolvedVariation || undefined, qty });

      if (mi.stockMode === "DIRECT") {
        countedDraw.set(mi.id, (countedDraw.get(mi.id) ?? 0) + qty);
        countedById.set(mi.id, mi);
      } else {
        recipeDraw.push({ recipe: linesForVariation, qty });
        for (const line of linesForVariation) ingredientById.set(line.inventoryItem.id, line.inventoryItem);
      }
    }

    // Aggregate the ingredient draw so shared ingredients (milk across drinks) sum up.
    const impact: IngredientImpact[] = [];
    for (const [inventoryItemId, deduct] of ingredientDraw(recipeDraw)) {
      const ing = ingredientById.get(inventoryItemId);
      if (!ing) continue;
      impact.push({
        inventoryItemId,
        name: ing.ingredientName,
        unit: ing.unit,
        deduct,
        before: ing.stockQuantity,
        remaining: Math.max(0, ing.stockQuantity - deduct),
        insufficient: deduct > ing.stockQuantity,
        kind: "ingredient",
      });
    }
    // Counted items land in the same list so one table shows the whole effect.
    for (const [menuItemId, deduct] of countedDraw) {
      const mi = countedById.get(menuItemId);
      if (!mi) continue;
      impact.push({
        inventoryItemId: menuItemId,
        name: mi.name,
        unit: mi.unitLabel,
        deduct,
        before: mi.stockQuantity,
        remaining: Math.max(0, mi.stockQuantity - deduct),
        insufficient: deduct > mi.stockQuantity,
        kind: "item",
      });
    }
    impact.sort((a, b) => a.name.localeCompare(b.name));

    const applied = apply.length;
    const totalUnits = apply.reduce((sum, r) => sum + r.qty, 0);

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dupe = await prisma.importLog.count({
      where: { fileName: file.name, createdAt: { gte: dayAgo } },
    });

    return {
      success: true,
      fileName: file.name,
      rows,
      apply,
      impact,
      totals: { rowCount: rows.length, applied, skipped: rows.length - applied, totalUnits },
      possibleDuplicate: dupe > 0,
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to read the file.");
  }
}

export type ApplyResult =
  | { success: false; error: string }
  | { success: true; applied: number; totalUnits: number; deducted: number };

/**
 * Applies a previewed import. Trusts only (menuItemId, variation, qty) — recipes
 * and stock are re-read here so the client can't drive the deduction maths.
 * Same batched, outside-the-transaction pattern as payOrder to stay under the
 * DB's timeout.
 */
export async function applySalesImport(lines: ApplyLine[], fileName: string): Promise<ApplyResult> {
  try {
    const actor = await requireCan("manageInventory");

    const clean = (lines ?? []).filter(
      (l) => l && typeof l.menuItemId === "string" && Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 9999
    );
    if (clean.length === 0) return { success: false as const, error: "Nothing to import." };

    // Counted stock is one pool per item; recipe deduction is per variation.
    const qtyByItem = new Map<string, number>();
    const qtyByItemVariation = new Map<string, number>();
    for (const l of clean) {
      qtyByItem.set(l.menuItemId, (qtyByItem.get(l.menuItemId) ?? 0) + l.qty);
      const key = `${l.menuItemId}\u0000${l.variation ?? ""}`;
      qtyByItemVariation.set(key, (qtyByItemVariation.get(key) ?? 0) + l.qty);
    }

    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: [...qtyByItem.keys()] } },
      include: { recipe: { include: { inventoryItem: true } } },
    });

    const recipeDraw: { recipe: RecipeLine[]; qty: number }[] = [];
    const ingredients = new Map<string, RecipeLine["inventoryItem"] & { reorderLevel: number }>();
    // Counted items are deducted from their own stockQuantity. Kept separate
    // because ingredientDraw() is keyed by inventoryItemId and knows nothing
    // about menu items.
    const counted: typeof menuItems = [];
    for (const [key, qty] of qtyByItemVariation) {
      const [menuItemId, variation = ""] = key.split("\u0000");
      const mi = menuItems.find((m) => m.id === menuItemId);
      if (!mi) continue;

      if (mi.stockMode === "DIRECT") {
        if (!counted.some((c) => c.id === mi.id)) counted.push(mi);
        continue;
      }
      const linesForVariation = recipeForVariation(mi.recipe, variation);
      if (linesForVariation.length === 0) continue;
      recipeDraw.push({ recipe: linesForVariation, qty });
      for (const line of linesForVariation) {
        ingredients.set(line.inventoryItem.id, line.inventoryItem);
      }
    }

    // The product lines exactly as imported (name, variation, qty), so the log
    // can be re-downloaded and its per-product breakdown shown later.
    const nameById = new Map(menuItems.map((mi) => [mi.id, mi.name]));
    const productLines = [...qtyByItemVariation.entries()]
      .map(([key, qty]) => {
        const [menuItemId, variation = ""] = key.split("\u0000");
        return {
          product: nameById.get(menuItemId) ?? "Unknown",
          variation: variation || undefined,
          qty,
        };
      })
      .sort((a, b) =>
        a.product.localeCompare(b.product) || (a.variation ?? "").localeCompare(b.variation ?? "")
      );

    const draw = ingredientDraw(recipeDraw);
    const details: IngredientImpact[] = [];
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    // Ledger rows are collected and inserted in ONE createMany, not one create
    // per ingredient — every statement is a network round trip to the remote
    // Aiven DB, so a full-day import (26 ingredients) used to fire 2N+1
    // statements and blow past the 20s transaction timeout (P2028).
    const movementData: Prisma.StockMovementCreateManyInput[] = [];

    for (const [inventoryItemId, needed] of draw) {
      const ing = ingredients.get(inventoryItemId);
      if (!ing) continue;
      const next = Math.max(0, ing.stockQuantity - needed);
      details.push({
        inventoryItemId,
        name: ing.ingredientName,
        unit: ing.unit,
        deduct: needed,
        before: ing.stockQuantity,
        remaining: next,
        insufficient: needed > ing.stockQuantity,
        kind: "ingredient",
      });
      writes.push(
        prisma.inventoryItem.update({
          where: { id: inventoryItemId },
          data: { stockQuantity: next, status: computeStatus(next, ing.reorderLevel) },
        })
      );
      // One ledger row per ingredient so the day's sales show up in Stock History.
      movementData.push({
        inventoryItemId,
        type: "SALES_IMPORT",
        change: next - ing.stockQuantity,
        before: ing.stockQuantity,
        after: next,
        reason: fileName.slice(0, 160),
        createdById: actor.id,
      });
    }

    // Counted items: one update each, no ledger row. StockMovement.inventoryItemId
    // is a non-null FK to InventoryItem, so a menu item cannot be written there —
    // the ImportLog details below and the Activity entry are their audit trail.
    for (const mi of counted) {
      const needed = qtyByItem.get(mi.id) ?? 0;
      if (needed <= 0) continue;
      const next = Math.max(0, mi.stockQuantity - needed);
      details.push({
        inventoryItemId: mi.id,
        name: mi.name,
        unit: mi.unitLabel,
        deduct: needed,
        before: mi.stockQuantity,
        remaining: next,
        insufficient: needed > mi.stockQuantity,
        kind: "item",
      });
      writes.push(
        prisma.menuItem.update({ where: { id: mi.id }, data: { stockQuantity: next } })
      );
    }

    if (movementData.length > 0) {
      writes.push(prisma.stockMovement.createMany({ data: movementData }));
    }

    const appliedCount = recipeDraw.length + counted.length;
    const totalUnits = [...qtyByItem.values()].reduce((s, n) => s + n, 0);

    writes.push(
      prisma.importLog.create({
        data: {
          fileName: fileName.slice(0, 180),
          rowCount: clean.length,
          appliedCount,
          skippedCount: clean.length - appliedCount,
          totalUnits,
          details: { lines: productLines, impact: details } as unknown as Prisma.InputJsonValue,
          uploadedById: actor.id,
        },
      })
    );

    // Rides along in the same transaction as the deduction, so the Activity feed
    // can never claim an import that didn't actually apply.
    writes.push(
      prisma.activityLog.create({
        data: activityData({
          actor,
          area: "IMPORT",
          action: "IMPORT",
          targetName: fileName.slice(0, 180),
          detail: `${totalUnits} unit${totalUnits === 1 ? "" : "s"} sold · ${details.length} stock line${details.length === 1 ? "" : "s"} deducted`,
        }),
      })
    );

    // This batch is heavier than a single order's payment (up to ~28 statements
    // for a full day's sales), so give it a longer ceiling than the 20s global
    // default in prisma.ts — that default is tuned for payOrder and left alone.
    await prisma.$transaction(writes, { timeout: 60_000, maxWait: 15_000 });

    // Reflect the new stock / sold-out state everywhere it shows.
    revalidatePath("/menu");
    revalidatePath("/");
    for (const role of ["supervisor", "owner"]) {
      revalidatePath(`/staff/${role}`);
      revalidatePath(`/staff/${role}/inventory`);
      revalidatePath(`/staff/${role}/inventory/import`);
      revalidatePath(`/staff/${role}/inventory/history`);
      revalidatePath(`/staff/${role}/inventory/alerts`);
      // Menu lives under Supervisor and Owner now, not Admin.
      revalidatePath(`/staff/${role}/menu`);
    }
    revalidatePath("/staff/admin");
    revalidatePath("/staff/admin/menu-health");

    return { success: true as const, applied: appliedCount, totalUnits, deducted: details.length };
  } catch (e) {
    console.error("applySalesImport failed:", e);
    return { success: false as const, error: e instanceof Error ? e.message : "Failed to apply the import." };
  }
}

export async function getImportLogs(limit = 20) {
  const logs = await prisma.importLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { uploadedBy: { select: { name: true } } },
  });

  return logs.map((log) => {
    const details = parseImportDetails(log.details);
    return {
      id: log.id,
      fileName: log.fileName,
      rowCount: log.rowCount,
      appliedCount: log.appliedCount,
      skippedCount: log.skippedCount,
      totalUnits: log.totalUnits,
      uploadedBy: log.uploadedBy?.name ?? "—",
      createdAt: log.createdAt.toISOString(),
      lines: details.lines,
      impact: details.impact,
    };
  });
}
