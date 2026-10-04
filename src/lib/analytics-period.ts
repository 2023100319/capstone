/** The stock-analytics windows offered in the UI, shared by the page, the
 *  analytics action, and the xlsx export route. Kept out of the "use server"
 *  file because that file may only export async functions. */
export const ANALYTICS_PERIODS = [7, 30, 90];

/** Clamp an untrusted `days` value to one of the offered windows. */
export function normalizeDays(input: unknown): number {
  const n = Number(input);
  return ANALYTICS_PERIODS.includes(n) ? n : 30;
}
