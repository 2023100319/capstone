/**
 * Decision Support Insights — the plain-language read of the inventory that both
 * the Owner and the Supervisor dashboard show.
 *
 * Each insight carries the sentence *and* the rows it was derived from, so the
 * card can be expanded to show the working rather than making someone go look it
 * up on another screen. Pure functions over data the pages have already fetched:
 * no Prisma, no session, nothing to mock when reasoning about the wording.
 *
 * The two tiles answer different questions on purpose (the client asked for
 * them to stop saying the same thing, 2026-09-13):
 *
 * Restock Recommendation — what is out or low RIGHT NOW, and how much to order.
 * Stock Prediction — what the sales history says will run out NEXT, per day of
 * burn rate, regardless of whether it reads low today.
 */

import type { getInventorySnapshot, getUsageRates } from "@/app/actions/reports";
import type { getExpiringSoon } from "@/app/actions/inventory";

type Snapshot = Awaited<ReturnType<typeof getInventorySnapshot>>;
type Expiring = Awaited<ReturnType<typeof getExpiringSoon>>;
type Usage = Awaited<ReturnType<typeof getUsageRates>>;

export type InsightRow = {
  id: string;
  name: string;
  /** The number that matters, e.g. "0 L · Out of stock" or "≈1.2 L/day · runs out in ~3 days". */
  meta: string;
  tint: "red" | "amber" | "muted";
  /** The consequence, e.g. which dishes stop selling. */
  note?: string;
};

export type Insight = {
  key: string;
  title: string;
  /** The one-liner shown while collapsed. */
  body: string;
  rows: InsightRow[];
  /** Shown when someone expands an insight that has nothing to list. */
  emptyDetail: string;
};

const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "in 2 days" / "tomorrow" / "today" / "3 days ago" — how a person would say it. */
function whenExpiring(daysLeft: number) {
  if (daysLeft < 0) return `expired ${plural(-daysLeft, "day")} ago`;
  if (daysLeft === 0) return "expires today";
  if (daysLeft === 1) return "expires tomorrow";
  return `expires in ${daysLeft} days`;
}

/** How a run-out forecast reads at whole-day resolution. */
function whenRunningOut(daysLeft: number) {
  if (daysLeft < 1) return "runs out today";
  if (daysLeft < 2) return "runs out tomorrow";
  return `runs out in ~${Math.floor(daysLeft)} days`;
}

function blockedNote(menuItems: string[]) {
  if (menuItems.length === 0) return undefined;
  if (menuItems.length <= 3) return `Blocks ${menuItems.join(", ")}`;
  return `Blocks ${menuItems.slice(0, 3).join(", ")} and ${menuItems.length - 3} more`;
}

function expiringRow(item: Expiring[number]): InsightRow {
  return {
    id: item.id,
    name: item.ingredientName,
    meta: `${num(item.stockQuantity)} ${item.unit} · ${whenExpiring(item.daysLeft)}`,
    tint: item.expired ? "red" : "amber",
    note: item.categoryName,
  };
}

/**
 * How much one order should bring the ingredient back to. Rule of thumb, stated
 * as such: cover the shortfall to twice the reorder level, and never less than
 * one full reorder level. No reorder level set → no guess.
 */
function suggestedOrder(stockQuantity: number, reorderLevel: number) {
  if (reorderLevel <= 0) return null;
  return Math.max(2 * reorderLevel - stockQuantity, reorderLevel);
}

export function buildInsights(snapshot: Snapshot, expiring: Expiring, usage: Usage = []) {
  const out = snapshot.attention.filter((i) => i.status === "OUT_OF_STOCK");
  const low = snapshot.attention.filter((i) => i.status === "LOW");
  const blocking = snapshot.blocked.filter((b) => b.status === "OUT_OF_STOCK");

  // Out of stock first — that is what stops a sale today.
  const restockRows = [...out, ...low].map((item) => {
    const row: InsightRow = {
      id: item.id,
      name: item.name,
      meta: `${num(item.stockQuantity)} ${item.unit} · ${
        item.status === "OUT_OF_STOCK" ? "Out of stock" : "Low"
      }`,
      tint: item.status === "OUT_OF_STOCK" ? "red" : "amber",
      note: blockedNote(item.menuItems),
    };
    const suggested = suggestedOrder(item.stockQuantity, item.reorderLevel);
    if (suggested !== null) {
      row.meta += ` · order ~${num(suggested)} ${item.unit}`;
    }
    return row;
  });
  const expiringRows = [...expiring]
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(expiringRow);

  let restockBody: string;
  if (blocking.length > 0) {
    const dishes = [...new Set(blocking.flatMap((b) => b.menuItems))];
    restockBody = `${blocking.map((b) => b.name).join(", ")} ran out — ${plural(
      dishes.length,
      "menu item"
    )} cannot be sold (${dishes.slice(0, 3).join(", ")}).`;
  } else if (out.length > 0) {
    restockBody = `${out.map((i) => i.name).join(", ")} ${
      out.length === 1 ? "is" : "are"
    } out of stock. Reorder now.`;
  } else if (low.length > 0) {
    restockBody = `${low[0].name} is down to ${num(low[0].stockQuantity)} ${low[0].unit}. Reorder soon.`;
  } else {
    restockBody = "All ingredients are above their reorder level.";
  }

  // ─── Stock Prediction ─────────────────────────────────────────────────────
  // Forward-looking from real usage: stock ÷ burn rate = days left. An
  // ingredient reading GOOD today can still be next to run out — that gap
  // between the two tiles is exactly what the client asked for. Ingredients
  // already out are left to the Restock tile so the two never repeat each other.
  let predictionBody: string;
  let predictionRows: InsightRow[];

  if (usage.length === 0) {
    predictionBody =
      "No sales have been imported yet, so there is no usage history to predict from. " +
      "Import a day's sales and this forecast builds itself.";
    predictionRows = [];
  } else {
    predictionRows = usage
      .filter((u) => u.dailyUsage > 0 && u.stockQuantity > 0)
      .map((u) => ({
        u,
        daysLeft: u.stockQuantity / u.dailyUsage,
      }))
      .filter(({ daysLeft }) => daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .map(({ u, daysLeft }) => ({
        id: u.inventoryItemId,
        name: u.ingredientName,
        meta: `≈${num(u.dailyUsage)} ${u.unit}/day · ${whenRunningOut(daysLeft)}`,
        tint: daysLeft < 2 ? ("red" as const) : ("amber" as const),
      }));

    predictionBody =
      predictionRows.length > 0
        ? `${plural(predictionRows.length, "ingredient")} forecast to run out within 7 days at the current rate of use, starting with ${predictionRows[0].name}.`
        : "At the current rate of use, stock is forecast to last beyond 7 days.";
  }

  return {
    restock: {
      key: "restock",
      title: "Restock Recommendation",
      body: restockBody,
      rows: restockRows,
      emptyDetail: "Every ingredient is above its reorder level — nothing to order.",
    } satisfies Insight,

    prediction: {
      key: "prediction",
      title: "Stock Prediction",
      body: predictionBody,
      rows: predictionRows,
      emptyDetail: "Nothing is forecast to run out within 7 days.",
    } satisfies Insight,

    expiring: {
      key: "expiring",
      title: "Expiring Soon",
      body:
        expiring.length > 0
          ? `${plural(expiring.length, "ingredient")} ${
              expiring.length === 1 ? "expires" : "expire"
            } within 7 days.`
          : "Nothing expires within 7 days.",
      rows: expiringRows,
      emptyDetail: "Nothing on the shelf expires within the next 7 days.",
    } satisfies Insight,
  };
}
