"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Search, UserCheck, Activity as ActivityIcon, CalendarDays, Trophy,
  ChevronLeft, ChevronRight, X, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/brand/stat-card";
import type { ActivityResult } from "@/app/actions/activity";
import {
  ACTIVITY_AREAS, ACTIVITY_PERIODS, ACTION_LABEL, AREA_LABEL, AREA_TINT,
  PER_PAGE, SELF_CONTAINED_ACTIONS,
} from "@/lib/activity-filters";
import { cn } from "@/lib/utils";

type Filters = { q: string; area: string; staff: string; days: number };

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityFeed({
  result,
  filters,
}: {
  result: ActivityResult;
  filters: Filters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.q);
  // Adjusting state during render — React's pattern for resyncing to a changed
  // prop — so Clear filters and the Back button reset the box without an effect.
  const [lastQ, setLastQ] = useState(filters.q);
  if (lastQ !== filters.q) {
    setLastQ(filters.q);
    setSearch(filters.q);
  }

  /** Build a URL that keeps the current filters and overrides only what changed.
   *  Any filter change resets to page 1 — page 4 of the old result set means
   *  nothing once the filters move. */
  function hrefWith(changes: Partial<Filters & { page: number }>) {
    const next = { ...filters, page: 1, ...changes };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.area) params.set("area", next.area);
    if (next.staff) params.set("staff", next.staff);
    if (next.days !== 30) params.set("days", String(next.days));
    if (next.page > 1) params.set("page", String(next.page));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function apply(changes: Partial<Filters & { page: number }>) {
    startTransition(() => router.replace(hrefWith(changes)));
  }

  // Debounce typing so each keystroke isn't a round trip.
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => apply({ q: search }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filtered = Boolean(filters.q || filters.area || filters.staff);
  const { rows, page, pageCount, total } = result;

  // Who tops the per-staff table. Marking row 0 would pick a winner out of a
  // tie, so the badge goes to everyone on the top score — and to nobody when
  // every row shares it, because then there is no "most active".
  const topTotal = result.byStaff[0]?.total ?? 0;
  const hasLeader = result.byStaff.some((s) => s.total < topTotal);
  const from = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Everything staff do across inventory, the menu, accounts and imports. Read-only oversight.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Actions"
          value={String(result.summary.total)}
          icon={ActivityIcon}
          tint="blue"
          sub={`in the last ${filters.days} days`}
        />
        {/* The same card the Access Review shows, down to the label and icon:
            one definition of the headcount, so the two screens cannot disagree.
            Who actually acted in this window is the table further down. */}
        <StatCard
          label="Active accounts"
          value={String(result.summary.activeAccounts)}
          icon={UserCheck}
          tint="navy"
        />
        <StatCard label="Today" value={String(result.summary.today)} icon={CalendarDays} tint="green" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item, staff or detail..."
            className="w-full rounded-lg bg-card py-2 pr-4 pl-9 text-sm text-foreground shadow-sm ring-1 ring-border transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50 sm:w-72"
          />
        </div>

        <select
          value={filters.area}
          onChange={(e) => apply({ area: e.target.value })}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="">All areas</option>
          {ACTIVITY_AREAS.map((a) => (
            <option key={a} value={a}>
              {AREA_LABEL[a]} ({result.areaCounts[a] ?? 0})
            </option>
          ))}
        </select>

        <select
          value={filters.staff}
          onChange={(e) => apply({ staff: e.target.value })}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="">All staff</option>
          {result.actors.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {ACTIVITY_PERIODS.map((p) => (
            <Link
              key={p}
              href={hrefWith({ days: p })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                filters.days === p
                  ? "bg-brand-navy text-white"
                  : "text-secondary-foreground hover:text-foreground"
              )}
            >
              {p}d
            </Link>
          ))}
        </div>

        {filtered && (
          <Link
            href={hrefWith({ q: "", area: "", staff: "" })}
            className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </Link>
        )}

        {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Feed */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-foreground">
                {filtered ? "No activity matches those filters" : "Nothing recorded yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {filtered
                  ? "Try a wider period or clear the filters."
                  : "Actions are recorded here as staff use the system."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Area</th>
                    <th className="px-4 py-3 font-medium">Staff</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Detail</th>
                    <th className="px-6 py-3 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-6 py-3">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            AREA_TINT[r.area]
                          )}
                        >
                          {AREA_LABEL[r.area]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{r.actorName}</span>
                        <span className="ml-2 text-xs capitalize text-muted-foreground">
                          {r.actorRole.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {ACTION_LABEL[r.action]}
                        {!SELF_CONTAINED_ACTIONS.includes(r.action) && (
                          <span className="font-medium"> {r.targetName}</span>
                        )}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-muted-foreground">
                        <span className="block truncate" title={r.detail}>
                          {r.detail || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-xs whitespace-nowrap text-muted-foreground">
                        {fmtWhen(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Showing {from}–{to} of {total}
          </p>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <PageLink href={hrefWith({ page: page - 1 })} disabled={page === 1} label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </PageLink>
              {pageWindow(page, pageCount).map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Link
                    key={p}
                    href={hrefWith({ page: p })}
                    className={cn(
                      "min-w-9 rounded-lg px-3 py-1.5 text-center text-sm font-medium transition-colors",
                      p === page
                        ? "bg-brand-navy text-white"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {p}
                  </Link>
                )
              )}
              <PageLink href={hrefWith({ page: page + 1 })} disabled={page === pageCount} label="Next">
                <ChevronRight className="h-4 w-4" />
              </PageLink>
            </div>
          )}
        </div>
      )}

      {/* Per-staff breakdown */}
      {result.byStaff.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground">By staff member</CardTitle>
            {/* The rows were already ordered busiest-first; nothing said so. */}
            <p className="text-xs text-muted-foreground">
              Most active first · last {filters.days} days
              {filtered && " · matching the filters above"}
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-10 px-6 py-3 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Staff</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                  {ACTIVITY_AREAS.map((a) => (
                    <th key={a} className="px-4 py-3 text-right font-medium text-muted-foreground">
                      {AREA_LABEL[a]}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Last action</th>
                </tr>
              </thead>
              <tbody>
                {result.byStaff.map((s, index) => {
                  const isTop = hasLeader && s.total === topTotal;
                  return (
                  <tr
                    key={s.name}
                    className={cn(
                      "border-b transition-colors last:border-0 hover:bg-muted/40",
                      isTop && "bg-amber-50/60"
                    )}
                  >
                    <td className="px-6 py-3 tabular-nums text-muted-foreground">{index + 1}</td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {s.name}
                      {isTop && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-amber-800">
                          <Trophy className="h-3 w-3" /> Most active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
                        {s.role.toLowerCase()}
                      </span>
                    </td>
                    {ACTIVITY_AREAS.map((a) => (
                      <td key={a} className="px-4 py-3 text-right text-foreground/80">
                        {s.counts[a] || <span className="text-muted-foreground/40">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{s.total}</td>
                    <td className="px-6 py-3 text-right text-xs whitespace-nowrap text-muted-foreground">
                      {s.lastAction ? fmtWhen(s.lastAction) : "—"}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-label={label}
        aria-disabled="true"
        className="rounded-lg p-2 text-muted-foreground/40"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}

/** Up to 7 slots: first, last, the pages around the current one, `null` for gaps. */
function pageWindow(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const pages = new Set([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const out: (number | null)[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) out.push(null);
    out.push(p);
    previous = p;
  }
  return out;
}
