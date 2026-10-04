"use server";

import prisma from "@/lib/prisma";
import type { OrderLineItem } from "@/types/order";
import { parseMonth, type ReportData, type ReportFilters, type ReportPoint, type ReportRange } from "@/types/reports";

/** How far back each rolling range looks. */
const RANGE_DAYS: Record<ReportRange, number> = {
  DAY: 1,
  WEEK: 7,
  MONTH: 30,
  YEAR: 365,
};

/**
 * A bucket's sort key and its display label, kept apart so the x-axis stays in
 * chronological order — "Apr" sorts before "Jan" alphabetically, which used to
 * scramble the yearly chart.
 */
function bucket(date: Date, range: ReportRange): { key: string; label: string } {
  if (range === "DAY") {
    const hour = String(date.getHours()).padStart(2, "0");
    return { key: hour, label: `${hour}:00` };
  }
  if (range === "YEAR") {
    return {
      key: `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`,
      label: date.toLocaleString("en-PH", { month: "short" }),
    };
  }
  return {
    key: `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`,
    label: date.toLocaleString("en-PH", { month: "2-digit", day: "2-digit" }),
  };
}

/**
 * The half-open [from, to) window a report covers. MONTH means a real calendar
 * month in Manila time so the picker can walk backwards through the year; the
 * other ranges are rolling windows ending now, which need no upper bound.
 *
 * `to` must stay null for those — a far-future sentinel like `new Date(8.64e15)`
 * is year 275760, which MySQL rejects outright ("Incorrect DATETIME value"), so
 * nothing matched and Day/Week/Year all reported zero.
 */
function reportWindow(range: ReportRange, month: string): { from: Date; to: Date | null } {
  if (range === "MONTH") {
    const [year, monthNumber] = month.split("-").map(Number);
    const nextYear = monthNumber === 12 ? year + 1 : year;
    const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    return {
      from: new Date(`${month}-01T00:00:00+08:00`),
      to: new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+08:00`),
    };
  }

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (RANGE_DAYS[range] - 1));
  return { from, to: null };
}

export async function getReport(filters: ReportFilters): Promise<ReportData> {
  const { range } = filters;
  const month = parseMonth(filters.month);
  const menuItemId = filters.menuItemId ?? "";
  const { from, to } = reportWindow(range, month);
  // Rolling ranges have no end, so the upper bound is left off entirely.
  const within = { gte: from, ...(to ? { lt: to } : {}) };

  const [paidOrders, purchases, product] = await Promise.all([
    // Revenue is only money actually taken at the counter.
    prisma.order.findMany({
      where: { paidAt: within, status: { not: "CANCELLED" } },
      select: { paidAt: true, totalAmount: true, items: true },
    }),
    prisma.stockPurchase.findMany({
      where: { createdAt: within },
      select: { createdAt: true, totalCost: true },
    }),
    menuItemId
      ? prisma.menuItem.findUnique({ where: { id: menuItemId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

  /** The line items this report counts — all of them, or one product's. */
  const linesOf = (order: { items: unknown }) => {
    const items = (order.items as unknown as OrderLineItem[]) ?? [];
    return menuItemId ? items.filter((i) => i.menuItemId === menuItemId) : items;
  };

  // Bucket both streams onto the same time axis.
  const buckets = new Map<string, ReportPoint>();
  const touch = ({ key, label }: { key: string; label: string }) => {
    if (!buckets.has(key)) buckets.set(key, { date: label, revenue: 0, expenses: 0 });
    return buckets.get(key)!;
  };

  // Top sellers, aggregated out of each order's line-item JSON.
  const tally = new Map<string, { revenue: number; orders: number }>();

  let revenue = 0;
  let unitsSold = 0;
  let orderCount = 0;

  for (const order of paidOrders) {
    const lines = linesOf(order);
    // A product filter drops orders that never contained it.
    if (menuItemId && lines.length === 0) continue;
    orderCount += 1;

    // Without a filter the order total is authoritative (it already reflects
    // the prices charged); with one, only the matching lines count.
    const orderRevenue = menuItemId
      ? lines.reduce((sum, i) => sum + i.price * i.qty, 0)
      : order.totalAmount;

    revenue += orderRevenue;
    if (order.paidAt) touch(bucket(order.paidAt, range)).revenue += orderRevenue;

    for (const item of lines) {
      unitsSold += item.qty;
      const entry = tally.get(item.name) ?? { revenue: 0, orders: 0 };
      entry.revenue += item.price * item.qty;
      entry.orders += item.qty;
      tally.set(item.name, entry);
    }
  }

  // Stock is bought per ingredient, so its cost belongs to the whole store and
  // can't be attributed to one product.
  const expenses = menuItemId ? 0 : purchases.reduce((sum, p) => sum + p.totalCost, 0);
  if (!menuItemId) {
    for (const purchase of purchases) {
      touch(bucket(purchase.createdAt, range)).expenses += purchase.totalCost;
    }
  }

  const series = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);

  const topItems = [...tally.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    range,
    month,
    menuItemId,
    productName: product?.name ?? null,
    revenue,
    expenses,
    profit: revenue - expenses,
    orderCount,
    unitsSold,
    series,
    topItems,
  };
}

/** Products the report can be narrowed to, for the filter dropdown. */
export async function getReportProducts() {
  return prisma.menuItem.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Used by the dashboard home pages and the restock insights. */
export async function getInventorySnapshot() {
  const [items, shortages] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { archivedAt: null },
      include: { category: true },
      orderBy: { stockQuantity: "asc" },
    }),
    // Every recipe line whose ingredient needs attention — this is what turns a
    // low ingredient into "these dishes are about to stop selling".
    prisma.recipeItem.findMany({
      where: {
        inventoryItem: { status: { in: ["LOW", "OUT_OF_STOCK"] }, archivedAt: null },
        menuItem: { status: { not: "ARCHIVED" } },
      },
      include: {
        inventoryItem: {
          select: {
            id: true,
            ingredientName: true,
            unit: true,
            stockQuantity: true,
            status: true,
          },
        },
        menuItem: { select: { name: true } },
      },
    }),
  ]);

  const counts = { GOOD: 0, LOW: 0, OUT_OF_STOCK: 0 };
  for (const item of items) counts[item.status] += 1;

  const soon = new Date();
  soon.setDate(soon.getDate() + 7);

  // One row per struggling ingredient, carrying the dishes that depend on it.
  const affected = new Map<
    string,
    {
      id: string;
      name: string;
      status: "LOW" | "OUT_OF_STOCK";
      stockQuantity: number;
      unit: string;
      menuItems: string[];
    }
  >();

  for (const line of shortages) {
    const ingredient = line.inventoryItem;
    const entry = affected.get(ingredient.id) ?? {
      id: ingredient.id,
      name: ingredient.ingredientName,
      status: ingredient.status as "LOW" | "OUT_OF_STOCK",
      stockQuantity: ingredient.stockQuantity,
      unit: ingredient.unit,
      menuItems: [],
    };
    // A dish can list the same ingredient only once, but two dishes can share it.
    if (!entry.menuItems.includes(line.menuItem.name)) entry.menuItems.push(line.menuItem.name);
    affected.set(ingredient.id, entry);
  }

  const blocked = [...affected.values()].sort((a, b) => {
    // Anything already out comes first — that's what stops a sale today.
    if (a.status !== b.status) return a.status === "OUT_OF_STOCK" ? -1 : 1;
    return b.menuItems.length - a.menuItems.length;
  });

  return {
    total: items.length,
    counts,
    expiringSoon: items.filter((i) => i.expiryDate && i.expiryDate <= soon).length,
    // Every ingredient that needs attention, not a preview slice — the dashboard
    // insights drill down into the whole list. Callers showing a fixed number of
    // chips slice it themselves. `menuItems` says which dishes go with it, so a
    // row can read "0 L left — Spanish Latte and Cafe Mocha stop selling".
    attention: items
      .filter((i) => i.status !== "GOOD")
      .map((i) => ({
        id: i.id,
        name: i.ingredientName,
        status: i.status,
        stockQuantity: i.stockQuantity,
        unit: i.unit,
        // Carried so the restock suggestion can name an order quantity.
        reorderLevel: i.reorderLevel,
        menuItems: affected.get(i.id)?.menuItems ?? [],
      })),
    blocked,
  };
}

/**
 * How fast each ingredient is actually being used, read off the sales-import
 * ledger. This is what turns the Stock Prediction tile from a restated "low
 * list" into a forecast: usage per day ÷ stock on hand = days until it runs out.
 * Stock and name ride along so the forecast can name GOOD ingredients too —
 * not just the ones already flagged low.
 */
export async function getUsageRates() {
  const now = Date.now();
  const windows = [
    { days: 14, since: new Date(now - 14 * 86_400_000) },
    { days: 30, since: new Date(now - 30 * 86_400_000) },
  ];

  // The last 14 days is the freshest read of the burn rate; a store that had a
  // slow fortnight (or a paused import habit) gets a 30-day one instead, so a
  // quiet period never zeroes the forecast out.
  for (const window of windows) {
    const movements = await prisma.stockMovement.findMany({
      where: { type: "SALES_IMPORT", createdAt: { gte: window.since } },
      select: { inventoryItemId: true, change: true, createdAt: true },
    });
    if (movements.length === 0) continue;

    const rates = new Map<string, { used: number; days: Set<string> }>();
    for (const m of movements) {
      const entry = rates.get(m.inventoryItemId) ?? { used: 0, days: new Set<string>() };
      // change is signed — SALES_IMPORT rows are deductions, but a correction
      // rolled into the same type can be positive, so sum the magnitude of
      // what moved rather than trusting the sign.
      entry.used += Math.abs(m.change);
      entry.days.add(m.createdAt.toISOString().slice(0, 10));
      rates.set(m.inventoryItemId, entry);
    }

    const items = await prisma.inventoryItem.findMany({
      where: { id: { in: [...rates.keys()] }, archivedAt: null },
      select: { id: true, ingredientName: true, unit: true, stockQuantity: true },
    });
    const byId = new Map(items.map((i) => [i.id, i]));

    return [...rates]
      .filter(([id, r]) => byId.has(id) && r.days.size > 0)
      .map(([id, r]) => {
        const item = byId.get(id)!;
        return {
          inventoryItemId: id,
          ingredientName: item.ingredientName,
          unit: item.unit,
          stockQuantity: item.stockQuantity,
          dailyUsage: r.used / r.days.size,
          daysObserved: r.days.size,
        };
      });
  }
  return [];
}

/** Most purchased ingredients — we track deliveries, not consumption. */
export async function getMostPurchased(limit = 4) {
  const grouped = await prisma.stockPurchase.groupBy({
    by: ["inventoryItemId"],
    _sum: { quantity: true, totalCost: true },
    // Ranked by how much has been restocked (quantity), not cost — the build is
    // inventory-only, so StockPurchase no longer carries a price.
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });

  if (grouped.length === 0) return [];

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: grouped.map((g) => g.inventoryItemId) } },
    select: { id: true, ingredientName: true, unit: true },
  });

  return grouped.map((g) => {
    const item = items.find((i) => i.id === g.inventoryItemId);
    return {
      name: item?.ingredientName ?? "Unknown",
      unit: item?.unit ?? "",
      quantity: g._sum.quantity ?? 0,
      cost: g._sum.totalCost ?? 0,
    };
  });
}
