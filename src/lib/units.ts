/**
 * Ingredient units, grouped so quantities can be added up honestly.
 *
 * The inventory measures ingredients in g, kg, ml, L and pcs at the same time,
 * so a plain sum across them ("Consumed: 1,240") counts 1,240 of nothing. Every
 * total on the analytics screens therefore runs through here: quantities are
 * converted to a family's base unit, added only within that family, and printed
 * with the unit they belong to.
 *
 * A unit nobody anticipated ("pack", "tray") is its own family with a factor of
 * 1, so it still totals correctly against itself and is never folded into mass
 * or volume by accident.
 *
 * Kept in a plain lib rather than beside the analytics action, because a
 * "use server" module may only export async functions.
 */

export type UnitFamily = "mass" | "volume" | "count" | (string & {});

type FamilySpec = { family: UnitFamily; factor: number };

/** Unit → its family and how many base units one of it is worth. */
const UNITS: Record<string, FamilySpec> = {
  mg: { family: "mass", factor: 0.001 },
  g: { family: "mass", factor: 1 },
  kg: { family: "mass", factor: 1000 },
  ml: { family: "volume", factor: 1 },
  l: { family: "volume", factor: 1000 },
  pc: { family: "count", factor: 1 },
  pcs: { family: "count", factor: 1 },
  piece: { family: "count", factor: 1 },
  pieces: { family: "count", factor: 1 },
};

/** How a family is written out, and when it steps up to the larger unit. */
const FAMILY_DISPLAY: Record<string, { base: string; large: string; step: number }> = {
  mass: { base: "g", large: "kg", step: 1000 },
  volume: { base: "ml", large: "L", step: 1000 },
  count: { base: "pcs", large: "pcs", step: Infinity },
};

/** Order the families are listed in, so two summaries always read alike. */
const FAMILY_ORDER = ["mass", "volume", "count"];

function specFor(unit: string): FamilySpec {
  const key = unit.trim().toLowerCase();
  return UNITS[key] ?? { family: key || "unit", factor: 1 };
}

/** Which family a unit belongs to — "mass", "volume", "count", or its own. */
export function unitFamily(unit: string): UnitFamily {
  return specFor(unit).family;
}

/** A quantity converted to its family's base unit (grams, ml, pieces). */
export function toBase(quantity: number, unit: string): number {
  return quantity * specFor(unit).factor;
}

/** The label a family's totals are read in — "kg" once they pass the step. */
export function familyUnit(family: UnitFamily, baseQty = 0): string {
  const display = FAMILY_DISPLAY[family];
  if (!display) return family;
  return Math.abs(baseQty) >= display.step ? display.large : display.base;
}

const num = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 1 });

/** A base-unit quantity written out — "8.4 kg", "950 ml", "96 pcs". */
export function formatFamilyQty(baseQty: number, family: UnitFamily): string {
  const display = FAMILY_DISPLAY[family];
  if (!display) return `${num(baseQty)} ${family}`;
  return Math.abs(baseQty) >= display.step
    ? `${num(baseQty / display.step)} ${display.large}`
    : `${num(baseQty)} ${display.base}`;
}

export type UnitTotal = { family: UnitFamily; baseQty: number };

/**
 * Total a set of (quantity, unit) pairs into one entry per family. Zero and
 * negative-to-zero families drop out, so a summary only names what moved.
 */
export function totalByFamily(rows: { qty: number; unit: string }[]): UnitTotal[] {
  const totals = new Map<UnitFamily, number>();
  for (const row of rows) {
    if (!row.qty) continue;
    const { family, factor } = specFor(row.unit);
    totals.set(family, (totals.get(family) ?? 0) + row.qty * factor);
  }

  return [...totals.entries()]
    .filter(([, baseQty]) => baseQty !== 0)
    .map(([family, baseQty]) => ({ family, baseQty }))
    .sort((a, b) => {
      const left = FAMILY_ORDER.indexOf(a.family);
      const right = FAMILY_ORDER.indexOf(b.family);
      return (left < 0 ? FAMILY_ORDER.length : left) - (right < 0 ? FAMILY_ORDER.length : right);
    });
}

/**
 * The one-line version of the above — "8.4 kg · 12.5 L · 96 pcs". `empty` is
 * what a card shows when nothing moved at all.
 */
export function summarizeByUnit(rows: { qty: number; unit: string }[], empty = "None"): string {
  const totals = totalByFamily(rows);
  if (totals.length === 0) return empty;
  return totals.map((t) => formatFamilyQty(t.baseQty, t.family)).join(" · ");
}

/**
 * The same totals split for a KPI tile, which has room for one big number: the
 * first family goes in `value`, the others trail in `rest`. Families keep their
 * fixed order so the same metric always leads with the same unit.
 */
export function headlineByUnit(
  rows: { qty: number; unit: string }[],
  empty = "None"
): { value: string; rest: string } {
  const totals = totalByFamily(rows);
  if (totals.length === 0) return { value: empty, rest: "" };
  return {
    value: formatFamilyQty(totals[0].baseQty, totals[0].family),
    rest: totals
      .slice(1)
      .map((t) => formatFamilyQty(t.baseQty, t.family))
      .join(" · "),
  };
}

/** A single ingredient's quantity, printed in its own unit. */
export function formatQty(qty: number, unit: string): string {
  return `${num(qty)} ${unit}`.trim();
}
