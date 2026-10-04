export type ReportRange = "DAY" | "WEEK" | "MONTH" | "YEAR";

export const REPORT_RANGES: ReportRange[] = ["DAY", "WEEK", "MONTH", "YEAR"];

export const RANGE_LABELS: Record<ReportRange, string> = {
  DAY: "Day",
  WEEK: "Week",
  MONTH: "Month",
  YEAR: "Year",
};

/**
 * What a report is narrowed to. `month` only applies to the MONTH range, where
 * it selects a real calendar month instead of a rolling 30-day window.
 */
export type ReportFilters = {
  range: ReportRange;
  month?: string;
  menuItemId?: string;
};

export type ReportPoint = { date: string; revenue: number; expenses: number };

export type ReportData = {
  range: ReportRange;
  /** The calendar month in view ("YYYY-MM"); only meaningful for MONTH. */
  month: string;
  menuItemId: string;
  /**
   * The product the report is narrowed to, or null for the whole store. When
   * set, expenses and profit are not meaningful — stock is bought per
   * ingredient, so its cost can't be split across products.
   */
  productName: string | null;
  revenue: number;
  expenses: number;
  profit: number;
  orderCount: number;
  unitsSold: number;
  series: ReportPoint[];
  topItems: { name: string; revenue: number; orders: number }[];
};

/** Defaults to MONTH: it opens on a period that has sales, and it is the range
 *  the month picker applies to. */
export function parseRange(value: string | undefined): ReportRange {
  const upper = (value ?? "").toUpperCase() as ReportRange;
  return REPORT_RANGES.includes(upper) ? upper : "MONTH";
}

/** The store's current month in Manila time, as "YYYY-MM". */
export function currentMonth(): string {
  // en-CA formats as YYYY-MM-DD, which slices cleanly.
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 7);
}

export function parseMonth(value: string | undefined): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : currentMonth();
}

export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    year: "numeric",
  });
}

/** The last `count` months, newest first — the options in the month picker. */
export function recentMonths(count = 12): { value: string; label: string }[] {
  const [thisYear, thisMonth] = currentMonth().split("-").map(Number);
  const months: { value: string; label: string }[] = [];

  for (let back = 0; back < count; back++) {
    let year = thisYear;
    let month = thisMonth - back;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }
    const value = `${year}-${String(month).padStart(2, "0")}`;
    months.push({ value, label: monthLabel(value) });
  }

  return months;
}
