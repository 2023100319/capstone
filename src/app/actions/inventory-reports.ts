"use server";

import prisma from "@/lib/prisma";
import { requireCan } from "@/lib/guards";
import { ANALYTICS_PERIODS } from "@/lib/analytics-period";
import { toBase, unitFamily } from "@/lib/units";
import type { InventoryStatus } from "@prisma/client";

/**
 * Analytics over the StockMovement ledger. The typed movements make the day's
 * story readable: SALES_IMPORT = consumption, WASTAGE + EXPIRY = loss, STOCK_IN
 * = restock, ADJUSTMENT = manual correction. One engine feeds both the
 * Supervisor Analytics page and the Owner Reports page (read-only + export).
 */

export type MovementTotals = {
  restocked: number;
  consumed: number;
  wasted: number;
  expired: number;
  adjustedNet: number;
  loss: number; // wasted + expired
};

export type TopRow = { name: string; unit: string; qty: number };

export type SeriesPoint = { label: string; consumed: number; loss: number; restocked: number };

/**
 * One ingredient's movement in the window, in that ingredient's own unit. This
 * is what makes the report specific: the totals above can only be read per
 * unit family, but a row here says "Fresh Milk — 120 L used, 4 L lost".
 */
export type IngredientMovementRow = {
  id: string;
  name: string;
  unit: string;
  categoryName: string;
  consumed: number;
  wasted: number;
  expired: number;
  restocked: number;
  adjustedNet: number;
  /** Ledger rows behind this line — the "how often", not the "how much". */
  movements: number;
  /** Stock right now, so the row says where the ingredient ended up. */
  onHand: number;
};

/**
 * A trend split by unit family, because a chart mixing grams and litres has no
 * y-axis. Quantities are in the family's base unit (g / ml / pcs); the label the
 * chart prints comes from familyUnit() in src/lib/units.ts, which steps up to kg
 * or L once the numbers are big enough. Busiest family first, so a chart opens
 * on the one with something to show.
 */
export type FamilySeries = { family: string; points: SeriesPoint[] };

export type MovementAnalytics = {
  days: number;
  totals: MovementTotals;
  topConsumed: TopRow[];
  topWasted: TopRow[];
  byIngredient: IngredientMovementRow[];
  seriesByFamily: FamilySeries[];
};

export async function getMovementAnalytics(days = 30): Promise<MovementAnalytics> {
  await requireCan("viewInventory");

  const period = ANALYTICS_PERIODS.includes(days) ? days : 30;
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (period - 1));

  const movements = await prisma.stockMovement.findMany({
    where: { createdAt: { gte: from } },
    select: { type: true, change: true, createdAt: true, inventoryItemId: true },
  });

  const totals: MovementTotals = {
    restocked: 0,
    consumed: 0,
    wasted: 0,
    expired: 0,
    adjustedNet: 0,
    loss: 0,
  };

  // One tally per ingredient — the top lists, the breakdown table and the
  // per-unit card totals are all read off this (change is signed; deductions
  // are negative).
  type Tally = {
    consumed: number;
    wasted: number;
    expired: number;
    restocked: number;
    adjustedNet: number;
    movements: number;
  };
  const byItem = new Map<string, Tally>();
  const tallyFor = (id: string): Tally => {
    const existing = byItem.get(id);
    if (existing) return existing;
    const created: Tally = {
      consumed: 0,
      wasted: 0,
      expired: 0,
      restocked: 0,
      adjustedNet: 0,
      movements: 0,
    };
    byItem.set(id, created);
    return created;
  };

  // Longer windows bucket weekly so the trend never renders 90 bars.
  const bucketDays = period <= 31 ? 1 : 7;
  const bucketCount = Math.ceil(period / bucketDays);
  const bucketLabels = Array.from({ length: bucketCount }, (_, i) => {
    const start = new Date(from);
    start.setDate(start.getDate() + i * bucketDays);
    return start.toLocaleDateString("en-PH", { month: "numeric", day: "numeric" });
  });
  const emptyPoints = (): SeriesPoint[] =>
    bucketLabels.map((label) => ({ label, consumed: 0, loss: 0, restocked: 0 }));
  const bucketOf = (at: Date) => {
    const dayOffset = Math.floor((at.getTime() - from.getTime()) / 86_400_000);
    return Math.min(bucketCount - 1, Math.max(0, Math.floor(dayOffset / bucketDays)));
  };

  for (const m of movements) {
    const out = -m.change; // positive magnitude for deductions
    const tally = tallyFor(m.inventoryItemId);
    tally.movements += 1;

    if (m.type === "STOCK_IN") {
      totals.restocked += m.change;
      tally.restocked += m.change;
    } else if (m.type === "SALES_IMPORT") {
      totals.consumed += out;
      tally.consumed += out;
    } else if (m.type === "WASTAGE") {
      totals.wasted += out;
      tally.wasted += out;
    } else if (m.type === "EXPIRY") {
      totals.expired += out;
      tally.expired += out;
    } else if (m.type === "ADJUSTMENT") {
      totals.adjustedNet += m.change;
      tally.adjustedNet += m.change;
    }
  }
  totals.loss = totals.wasted + totals.expired;

  // Resolve every ingredient that moved — the table names all of them, not just
  // the six in the top lists.
  const movedIds = [...byItem.keys()];
  const items = movedIds.length
    ? await prisma.inventoryItem.findMany({
        where: { id: { in: movedIds } },
        select: {
          id: true,
          ingredientName: true,
          unit: true,
          stockQuantity: true,
          category: { select: { name: true } },
        },
      })
    : [];
  const infoById = new Map(items.map((i) => [i.id, i]));

  const byIngredient: IngredientMovementRow[] = movedIds
    .map((id) => {
      const t = byItem.get(id) as Tally;
      const info = infoById.get(id);
      return {
        id,
        name: info?.ingredientName ?? "Unknown ingredient",
        unit: info?.unit ?? "",
        categoryName: info?.category.name ?? "—",
        onHand: info?.stockQuantity ?? 0,
        ...t,
      };
    })
    .sort((a, b) => b.consumed - a.consumed || a.name.localeCompare(b.name));

  const toTop = (pick: (row: IngredientMovementRow) => number): TopRow[] =>
    byIngredient
      .map((row) => ({ name: row.name, unit: row.unit, qty: pick(row) }))
      .filter((r) => r.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);

  // Second pass for the trend: the unit is only known now, and a chart can only
  // stack quantities that share one.
  const seriesFor = new Map<string, SeriesPoint[]>();
  for (const m of movements) {
    const info = infoById.get(m.inventoryItemId);
    if (!info) continue;
    const family = unitFamily(info.unit);
    let points = seriesFor.get(family);
    if (!points) {
      points = emptyPoints();
      seriesFor.set(family, points);
    }
    const point = points[bucketOf(m.createdAt)];
    if (!point) continue;

    const magnitude = Math.abs(toBase(m.change, info.unit));
    if (m.type === "SALES_IMPORT") point.consumed += magnitude;
    else if (m.type === "WASTAGE" || m.type === "EXPIRY") point.loss += magnitude;
    else if (m.type === "STOCK_IN") point.restocked += magnitude;
  }

  // Busiest family first — the chart opens on whichever one actually moved.
  const activityOf = (points: SeriesPoint[]) =>
    points.reduce((sum, p) => sum + p.consumed + p.loss + p.restocked, 0);

  const seriesByFamily: FamilySeries[] = [...seriesFor.entries()]
    .map(([family, points]) => ({ family, points }))
    .sort((a, b) => activityOf(b.points) - activityOf(a.points));

  return {
    days: period,
    totals,
    topConsumed: toTop((r) => r.consumed),
    topWasted: toTop((r) => r.wasted + r.expired),
    byIngredient,
    seriesByFamily,
  };
}

/* ─────────────────────────── Owner oversight reports ─────────────────────── */

export type SupplierItem = {
  name: string;
  unit: string;
  /** Delivered inside the selected window — 0 for an ingredient never restocked. */
  quantity: number;
  /** Current stock, so a supplier with no deliveries yet still says something. */
  onHand: number;
  status: InventoryStatus;
};
export type SupplierRow = {
  supplier: string;
  deliveries: number;
  ingredientCount: number;
  /** Null when this supplier has never delivered inside the window. */
  lastDelivery: string | null;
  items: SupplierItem[];
};

/**
 * Who the store buys from — the Owner's read-only supplier directory.
 *
 * Built from two sources on purpose. The ingredient list is the directory: any
 * live InventoryItem naming a supplier puts that supplier on the page straight
 * away, even before its first delivery. StockPurchase rows are then folded on
 * top for the delivery count, the quantities and the last-delivery date.
 *
 * Reading purchases alone (the original) meant a newly created ingredient's
 * supplier stayed invisible until someone edited the item to raise its stock,
 * because that edit was the only thing writing StockPurchase. createInventoryItem
 * now books opening stock as a delivery too, but the directory half is what keeps
 * a supplier visible when its ingredient starts at zero.
 *
 * Quantities stay per-ingredient (never summed across a supplier) because
 * ingredients use different units. A purchase with a blank supplier lands under
 * "Unspecified"; an ingredient with no supplier is simply not in the directory.
 * `days` narrows the delivery window — it never hides a supplier, so nothing
 * disappears when a period is picked.
 */
export async function getSupplierOverview(days?: number): Promise<SupplierRow[]> {
  await requireCan("viewInventory");

  let from: Date | undefined;
  if (days && ANALYTICS_PERIODS.includes(days)) {
    from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
  }

  const [ingredients, purchases] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { archivedAt: null, NOT: { supplier: null } },
      select: {
        ingredientName: true,
        unit: true,
        supplier: true,
        stockQuantity: true,
        status: true,
      },
    }),
    prisma.stockPurchase.findMany({
      where: from ? { createdAt: { gte: from } } : undefined,
      select: {
        supplier: true,
        quantity: true,
        createdAt: true,
        inventoryItem: {
          select: { ingredientName: true, unit: true, stockQuantity: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  type Entry = { deliveries: number; lastDelivery: Date | null; items: Map<string, SupplierItem> };
  const bySupplier = new Map<string, Entry>();

  function entryFor(key: string): Entry {
    const existing = bySupplier.get(key);
    if (existing) return existing;
    const created: Entry = { deliveries: 0, lastDelivery: null, items: new Map() };
    bySupplier.set(key, created);
    return created;
  }

  // 1. The directory — every live ingredient that names a supplier.
  for (const i of ingredients) {
    const key = i.supplier?.trim();
    if (!key) continue;
    entryFor(key).items.set(i.ingredientName, {
      name: i.ingredientName,
      unit: i.unit,
      quantity: 0,
      onHand: i.stockQuantity,
      status: i.status,
    });
  }

  // 2. Deliveries on top. An ingredient can appear here under a supplier it is
  //    no longer assigned to — history stands, so it gets its own row.
  for (const p of purchases) {
    const key = p.supplier?.trim() || "Unspecified";
    const entry = entryFor(key);
    entry.deliveries += 1;
    if (!entry.lastDelivery || p.createdAt > entry.lastDelivery) entry.lastDelivery = p.createdAt;

    const name = p.inventoryItem?.ingredientName ?? "Unknown";
    const line = entry.items.get(name) ?? {
      name,
      unit: p.inventoryItem?.unit ?? "",
      quantity: 0,
      onHand: p.inventoryItem?.stockQuantity ?? 0,
      status: p.inventoryItem?.status ?? "GOOD",
    };
    line.quantity += p.quantity;
    entry.items.set(name, line);
  }

  return [...bySupplier.entries()]
    .map(([supplier, e]) => ({
      supplier,
      deliveries: e.deliveries,
      ingredientCount: e.items.size,
      lastDelivery: e.lastDelivery?.toISOString() ?? null,
      items: [...e.items.values()].sort(
        (a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)
      ),
    }))
    .sort(
      (a, b) =>
        b.deliveries - a.deliveries ||
        b.ingredientCount - a.ingredientCount ||
        a.supplier.localeCompare(b.supplier)
    );
}

