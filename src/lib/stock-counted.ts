import type { InventoryStatus } from "@prisma/client";
import { computeStatus } from "@/lib/availability";

/**
 * Stock-counted items — finished goods the store bakes or buys in rather than
 * assembling from tracked ingredients. Bread, donuts, bottled drinks: their
 * stock is a plain count somebody types, so unlike a cooked-to-order dish it is
 * NOT derived from a recipe.
 *
 * A menu item is counted when its `stockMode` is DIRECT. That flag defaults from
 * `MenuCategory.tracksStockDirectly` when the item is created, but the item's own
 * value is what every read and every deduction obeys — so one dish inside a
 * counted category can still be recipe-based, and vice versa.
 *
 * This file holds only what BOTH the server actions and the client table need:
 * the row shape, the units and the write rules. It must stay free of Prisma
 * imports — `stock-counted-items.tsx` is a client component and importing the
 * client here would drag the server into the browser bundle. The queries and
 * mutations live in `src/app/actions/inventory.ts`.
 */

/** One row of the Stock-Counted Items table, as the server action returns it. */
export type StockCountedRow = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  /** How the count is spoken about — "pcs", "loaf", "pack". */
  unitLabel: string;
  stockCount: number;
  /** At or below this, the row reads Low. Zero stock always reads Out of Stock. */
  lowStockAt: number;
  status: InventoryStatus;
  /** ISO string — dates are serialised before they cross into the client. */
  updatedAt: string;
};

/** What the Inventory table may change. Name, price and category belong to the
 *  Menu screen — this tab only owns the counting. */
export type StockCountInput = {
  unitLabel: string;
  stockCount: number;
  lowStockAt: number;
};

/** Same discriminated result every other action in this app returns. */
export type StockResult = { success: true } | { success: false; error: string };

export const STOCK_UNITS = ["pcs", "loaf", "pack", "box", "tray", "bottle"];

export const STOCK_COUNT_MAX = 99_999;

/**
 * The write rules, in one place so the form refuses exactly what the server
 * action refuses. Returns an error message, or null when the input is good.
 */
export function validateStockCount(input: StockCountInput): string | null {
  if (!input.unitLabel.trim()) return "Choose a unit.";

  for (const [label, value] of [
    ["Stock", input.stockCount],
    ["Low-stock level", input.lowStockAt],
  ] as const) {
    if (!Number.isFinite(value)) return `${label} must be a number.`;
    if (!Number.isInteger(value)) return `${label} must be a whole number.`;
    if (value < 0) return `${label} cannot be negative.`;
    if (value > STOCK_COUNT_MAX) return `${label} is too large.`;
  }

  return null;
}

/** Status from the two numbers — the same rule ingredients use, so badges match. */
export function stockCountStatus(stockCount: number, lowStockAt: number): InventoryStatus {
  return computeStatus(stockCount, lowStockAt);
}
