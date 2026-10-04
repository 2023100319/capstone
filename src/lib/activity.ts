import type { ActivityAction, ActivityArea, Role } from "@prisma/client";
import prisma from "./prisma";

/**
 * Writes one row to the Activity feed. Every mutating server action calls this
 * after its write succeeds, so the Owner's Activity page can show what happened
 * across the whole system — not just the stock ledger.
 *
 * Deliberately swallows its own errors: a failure to record activity must never
 * turn a successful edit into an error the staff member sees.
 */

export type ActivityActor = { id: string; name?: string | null; role: Role } | null;

export type ActivityEntry = {
  actor: ActivityActor;
  area: ActivityArea;
  action: ActivityAction;
  /** What it happened to — an ingredient, menu item, category or account name. */
  targetName: string;
  targetId?: string | null;
  /** One-line human detail, e.g. "₱160 → ₱170" or "+15 L (Fresh Farms)". */
  detail?: string | null;
};

/** Import-driven rows have no signed-in actor; label them the way the old
 *  staff-activity view did so the feed reads consistently. */
const SYSTEM_NAME = "System / import";

export function activityData(entry: ActivityEntry) {
  return {
    actorId: entry.actor?.id ?? null,
    actorName: entry.actor?.name || SYSTEM_NAME,
    actorRole: entry.actor?.role ?? "SYSTEM",
    area: entry.area,
    action: entry.action,
    targetName: entry.targetName.slice(0, 180),
    targetId: entry.targetId ?? null,
    detail: entry.detail ? entry.detail.slice(0, 500) : null,
  };
}

export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    await prisma.activityLog.create({ data: activityData(entry) });
  } catch (e) {
    console.error("logActivity failed:", e);
  }
}

/** "20 → 35 L" — the shape most edit details take. */
export function changeDetail(before: number, after: number, unit = "") {
  const suffix = unit ? ` ${unit}` : "";
  return `${num(before)} → ${num(after)}${suffix}`;
}

/** "+15 L" / "−8 L", signed so the direction reads at a glance. */
export function deltaDetail(delta: number, unit = "") {
  const suffix = unit ? ` ${unit}` : "";
  return `${delta > 0 ? "+" : "−"}${num(Math.abs(delta))}${suffix}`;
}

function num(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
