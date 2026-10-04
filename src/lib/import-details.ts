import type { IngredientImpact } from "@/app/actions/sales-import";

/** The shape stored on `ImportLog.details`. Kept in a plain lib (not the
 *  "use server" actions file, which may only export async functions) so the
 *  sync parser + types can be shared by the action and the download route. */
export type ImportProductLine = { product: string; variation?: string; qty: number };
export type ImportDetails = { lines: ImportProductLine[]; impact: IngredientImpact[] };

/**
 * Normalise the `details` JSON into `{ lines, impact }`, tolerating the older
 * shape where `details` was just the `IngredientImpact[]` array (no product
 * lines) so pre-existing logs never crash the reader.
 */
export function parseImportDetails(raw: unknown): ImportDetails {
  if (Array.isArray(raw)) return { lines: [], impact: raw as IngredientImpact[] };
  if (raw && typeof raw === "object") {
    const obj = raw as { lines?: unknown; impact?: unknown };
    return {
      lines: Array.isArray(obj.lines) ? (obj.lines as ImportProductLine[]) : [],
      impact: Array.isArray(obj.impact) ? (obj.impact as IngredientImpact[]) : [],
    };
  }
  return { lines: [], impact: [] };
}
