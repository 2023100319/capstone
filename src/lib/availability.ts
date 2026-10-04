import type { InventoryStatus, StockMode } from "@prisma/client";

/**
 * The single rule for ingredient stock status. Every write that touches an
 * InventoryItem's quantity runs this, so the stored status can never drift from
 * the numbers — inventory edits, stock deliveries, and order payments alike.
 */
export function computeStatus(stockQuantity: number, reorderLevel: number): InventoryStatus {
  if (stockQuantity <= 0) return "OUT_OF_STOCK";
  if (stockQuantity <= reorderLevel) return "LOW";
  return "GOOD";
}

/** One recipe line, narrowed to what the availability maths needs. */
export type RecipeLine = {
  quantity: number;
  inventoryItem: {
    id: string;
    ingredientName: string;
    stockQuantity: number;
    unit: string;
  };
  /** Which variation this line feeds. "" / undefined = the recipe of an item
   *  with no variations; a labelled line belongs to exactly that variation. */
  variationLabel?: string;
};

/** How many of one variation can still be made, and why not more. */
export type VariationAvailability = {
  label: string;
  canMake: number;
  /** Ingredients that can't cover even one serving of this variation. */
  blockedBy: string[];
};

export type Availability = {
  hasRecipe: boolean;
  /**
   * True when the item's stock is a hand-typed count (stockMode DIRECT) rather
   * than something derived from ingredients. This is what separates "counted by
   * hand" from "not set up yet" — without it both look like an item with no
   * recipe, and every screen would flag finished goods as a setup gap.
   */
  tracksStock: boolean;
  /** Servings still makeable, or null when nothing limits the item at all. */
  canMake: number | null;
  unavailable: boolean;
  /** Ingredients that can't cover even one serving. Empty unless recipe-gated. */
  blockedBy: string[];
  /**
   * Per-variation availability — present only when the item's recipe is
   * split by variation (one ingredient set per variation label).
   */
  variations?: VariationAvailability[];
};

/** Servings one flat set of recipe lines can produce, and what blocks it. */
function flatAvailability(recipe: RecipeLine[]) {
  let canMake = Infinity;
  const blockedBy: string[] = [];

  for (const line of recipe) {
    const servings = Math.floor(line.inventoryItem.stockQuantity / line.quantity);
    if (servings <= 0) blockedBy.push(line.inventoryItem.ingredientName);
    canMake = Math.min(canMake, servings);
  }

  return {
    canMake: Number.isFinite(canMake) ? Math.max(0, canMake) : 0,
    blockedBy,
  };
}

/**
 * How many servings an item can still produce, and why not more.
 *
 * Two kinds of item, decided by stockMode:
 *
 * DIRECT — finished goods the store bakes or buys in. The typed count IS the
 * stock, so running out genuinely means sold out and nothing is deducted from
 * ingredients.
 *
 * RECIPE — cooked to order, gated by ingredient stock. One with no recipe lines
 * yet has nothing to run out of, so it stays orderable and the staff screens
 * flag it as needing setup; treating it as sold out would strand it on the menu
 * with no way to bring it back.
 *
 * Within RECIPE there are two shapes:
 *
 * Flat — one ingredient set under "" for the whole item.
 *
 * Per-variation — one ingredient set per variation label. Each variation is
 * capped by its own lines; the item can still produce while at least one
 * variation can be made, so its canMake is the SUM across variations (two
 * variations of ten each means twenty servings, whichever is ordered) and it
 * reads unavailable only when every variation is blocked.
 */
export function menuAvailability(item: {
  recipe?: RecipeLine[] | null;
  stockMode?: StockMode | null;
  stockQuantity?: number | null;
}): Availability {
  if (item.stockMode === "DIRECT") {
    const onHand = Math.max(0, item.stockQuantity ?? 0);
    return {
      hasRecipe: false,
      tracksStock: true,
      canMake: onHand,
      unavailable: onHand <= 0,
      blockedBy: [],
    };
  }

  const recipe = (item.recipe ?? []).filter((line) => line.quantity > 0);

  if (recipe.length === 0) {
    return { hasRecipe: false, tracksStock: false, canMake: null, unavailable: false, blockedBy: [] };
  }

  // Split the lines by variation: labelled lines belong to that variation, the
  // rest are the item's flat recipe.
  const byVariation = new Map<string, RecipeLine[]>();
  const base: RecipeLine[] = [];
  for (const line of recipe) {
    const label = line.variationLabel ?? "";
    if (label === "") base.push(line);
    else {
      const lines = byVariation.get(label);
      if (lines) lines.push(line);
      else byVariation.set(label, [line]);
    }
  }

  if (byVariation.size > 0) {
    const variations: VariationAvailability[] = [];
    for (const [label, lines] of byVariation) {
      const { canMake, blockedBy } = flatAvailability(lines);
      variations.push({ label, canMake, blockedBy });
    }

    const canMake = variations.reduce((sum, v) => sum + v.canMake, 0);
    const blockedBy = [
      ...new Set(variations.filter((v) => v.canMake <= 0).flatMap((v) => v.blockedBy)),
    ];

    return {
      hasRecipe: true,
      tracksStock: false,
      canMake,
      unavailable: canMake <= 0,
      blockedBy,
      variations,
    };
  }

  const { canMake, blockedBy } = flatAvailability(base);

  return {
    hasRecipe: true,
    tracksStock: false,
    canMake,
    unavailable: canMake <= 0,
    blockedBy,
  };
}

/**
 * Total ingredient draw for a basket of servings, keyed by inventoryItemId.
 * Used both to reject an order that can't be made and to deduct on payment,
 * so the check and the write always agree.
 */
export function ingredientDraw(
  servings: { recipe: RecipeLine[]; qty: number }[]
): Map<string, number> {
  const draw = new Map<string, number>();
  for (const { recipe, qty } of servings) {
    for (const line of recipe) {
      if (line.quantity <= 0) continue;
      const id = line.inventoryItem.id;
      draw.set(id, (draw.get(id) ?? 0) + line.quantity * qty);
    }
  }
  return draw;
}

/** The recipe lines of one variation — an item with no variations passes "".
 *  Generic over the line type so callers holding the full Prisma rows keep
 *  every field (reorderLevel, createdAt…) instead of narrowing to RecipeLine. */
export function recipeForVariation<T extends { variationLabel?: string }>(
  recipe: T[],
  variationLabel: string
): T[] {
  return recipe.filter((line) => (line.variationLabel ?? "") === variationLabel);
}
