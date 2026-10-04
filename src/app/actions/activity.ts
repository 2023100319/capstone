"use server";

import type { ActivityAction, ActivityArea, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireCan } from "@/lib/guards";
import { ACTIVITY_AREAS, ACTIVITY_PERIODS, PER_PAGE } from "@/lib/activity-filters";

/**
 * The Owner's Activity feed. Everything — search, area/staff/period filters and
 * paging — is resolved in the query rather than in JS, so the page stays fast
 * however long the log gets.
 */

export type ActivityRow = {
  id: string;
  actorName: string;
  actorRole: string;
  area: ActivityArea;
  action: ActivityAction;
  targetName: string;
  detail: string;
  createdAt: string; // ISO
};

export type ActivityFilters = {
  q?: string;
  area?: string;
  staff?: string;
  days?: number;
  page?: number;
};

export type ActivityResult = {
  rows: ActivityRow[];
  total: number;
  page: number;
  pageCount: number;
  /** Every name that has ever appeared, for the Staff filter. */
  actors: string[];
  /** Counts for the whole filtered window, before paging. */
  areaCounts: Record<string, number>;
  /**
   * Headline numbers. `total` and `today` follow the selected window and
   * filters; `activeAccounts` deliberately does not — it is the same headcount
   * the Access Review reports, so the two screens can never disagree.
   */
  summary: { total: number; activeAccounts: number; today: number };
  /** Per-person breakdown across the selected window. */
  byStaff: {
    name: string;
    role: string;
    counts: Record<string, number>;
    total: number;
    lastAction: string;
  }[];
};

function periodStart(days: number) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));
  return from;
}

export async function getActivity(filters: ActivityFilters = {}): Promise<ActivityResult> {
  await requireCan("viewInventory");

  const days = ACTIVITY_PERIODS.includes(filters.days ?? 0) ? (filters.days as number) : 30;
  const area = ACTIVITY_AREAS.includes(filters.area as ActivityArea)
    ? (filters.area as ActivityArea)
    : undefined;
  const q = filters.q?.trim() ?? "";
  const staff = filters.staff?.trim() || undefined;

  const where: Prisma.ActivityLogWhereInput = {
    createdAt: { gte: periodStart(days) },
    ...(area ? { area } : {}),
    ...(staff ? { actorName: staff } : {}),
    ...(q
      ? {
          OR: [
            { targetName: { contains: q } },
            { actorName: { contains: q } },
            { detail: { contains: q } },
          ],
        }
      : {}),
  };

  const total = await prisma.activityLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(Math.max(filters.page ?? 1, 1), pageCount);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [logs, grouped, actorNames, todayCount, activeAccounts] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    // One pass over the filtered window feeds both the area chips and the
    // per-staff table, so neither needs its own scan.
    prisma.activityLog.groupBy({
      by: ["actorName", "actorRole", "area"],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.activityLog.findMany({
      where: { createdAt: { gte: periodStart(days) } },
      distinct: ["actorName"],
      select: { actorName: true },
      orderBy: { actorName: "asc" },
    }),
    prisma.activityLog.count({ where: { ...where, createdAt: { gte: startOfToday } } }),
    // Same predicate getUsers() uses, so this card and the Access Review's
    // "Active accounts" are one number rather than two that look alike.
    prisma.user.count({ where: { status: "ACTIVE" } }),
  ]);

  const areaCounts: Record<string, number> = {};
  for (const a of ACTIVITY_AREAS) areaCounts[a] = 0;

  const byStaffMap = new Map<string, ActivityResult["byStaff"][number]>();
  for (const g of grouped) {
    areaCounts[g.area] += g._count._all;

    const row =
      byStaffMap.get(g.actorName) ??
      {
        name: g.actorName,
        role: g.actorRole,
        counts: Object.fromEntries(ACTIVITY_AREAS.map((a) => [a, 0])) as Record<string, number>,
        total: 0,
        lastAction: g._max.createdAt?.toISOString() ?? "",
      };
    row.counts[g.area] += g._count._all;
    row.total += g._count._all;
    const last = g._max.createdAt?.toISOString() ?? "";
    if (last > row.lastAction) row.lastAction = last;
    byStaffMap.set(g.actorName, row);
  }

  return {
    rows: logs.map((l) => ({
      id: l.id,
      actorName: l.actorName,
      actorRole: l.actorRole,
      area: l.area,
      action: l.action,
      targetName: l.targetName,
      detail: l.detail ?? "",
      createdAt: l.createdAt.toISOString(),
    })),
    total,
    page,
    pageCount,
    actors: actorNames.map((a) => a.actorName),
    areaCounts,
    summary: { total, activeAccounts, today: todayCount },
    byStaff: [...byStaffMap.values()].sort((a, b) => b.total - a.total),
  };
}
