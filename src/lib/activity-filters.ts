import type { ActivityAction, ActivityArea } from "@prisma/client";

/** Shared between the Activity page, its client feed and the query action.
 *  Kept out of the "use server" file because that may only export async
 *  functions — the same reason analytics-period.ts exists. */

export const ACTIVITY_AREAS: ActivityArea[] = [
  "INVENTORY",
  "MENU",
  "USERS",
  "RECIPE",
  "IMPORT",
  "AUTH",
];

export const AREA_LABEL: Record<ActivityArea, string> = {
  INVENTORY: "Inventory",
  MENU: "Menu",
  USERS: "Users",
  RECIPE: "Recipe",
  IMPORT: "Import",
  AUTH: "Sign-in",
};

/** Same badge idiom the stock ledger uses, re-keyed to areas. */
export const AREA_TINT: Record<ActivityArea, string> = {
  INVENTORY: "bg-emerald-50 text-emerald-700 border-emerald-100",
  MENU: "bg-blue-50 text-blue-700 border-blue-100",
  USERS: "bg-violet-50 text-violet-700 border-violet-100",
  RECIPE: "bg-amber-50 text-amber-700 border-amber-100",
  IMPORT: "bg-sky-50 text-sky-700 border-sky-100",
  AUTH: "bg-muted text-muted-foreground border-border",
};

/** Past-tense phrasing, so a row reads "Archived Milk" rather than "ARCHIVE". */
export const ACTION_LABEL: Record<ActivityAction, string> = {
  CREATE: "Added",
  UPDATE: "Edited",
  DELETE: "Deleted",
  ARCHIVE: "Archived",
  RESTORE: "Restored",
  STOCK_IN: "Added stock to",
  ADJUST: "Adjusted",
  WASTAGE: "Recorded wastage for",
  EXPIRY: "Marked expired",
  IMPORT: "Imported",
  LOGIN: "Signed in",
};

/** Actions that read as complete sentences on their own — no target appended. */
export const SELF_CONTAINED_ACTIONS: ActivityAction[] = ["LOGIN"];

export const ACTIVITY_PERIODS = [7, 30, 90];

/** Rows per page of the feed. Read by the query, the page count and the
 *  "Showing x–y of n" line, so they can never disagree. */
export const PER_PAGE = 15;
