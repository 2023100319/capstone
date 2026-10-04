import Link from "next/link";
import { Users, BookOpen, Layers, AlertTriangle, Sparkles, XCircle, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/brand/stat-card";
import { getUsers, getRoleUsage } from "@/app/actions/users";
import { getAdminMenuItems } from "@/app/actions/menu-admin";
import { getMenuCategories } from "@/app/actions/menu";
import { ROLES } from "@/lib/roles";
import { monthLabel, currentMonth } from "@/types/reports";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const roleLabel = (role: string) => role.charAt(0) + role.slice(1).toLowerCase();

function lastActiveLabel(date: Date) {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export default async function AdminDashboard() {
  const [users, usage, menuItems, archivedItems, categories] = await Promise.all([
    getUsers(false),
    getRoleUsage(),
    getAdminMenuItems(false),
    getAdminMenuItems(true),
    getMenuCategories(false),
  ]);

  // Counted-by-hand items are recipe-less on purpose, so they don't belong in
  // the setup-gap count. Same filter as Menu Health.
  const missingRecipe = menuItems.filter((i) => !i.hasRecipe && !i.tracksStock).length;
  const unavailable = menuItems.filter((i) => i.hasRecipe && i.unavailable).length;
  const promos = menuItems.filter((i) => i.isPromo || i.isRecommended).length;

  const recentLogins = [...users]
    .sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{monthLabel(currentMonth())}</p>
      </div>

      {/* Account + menu KPIs — Admin's actual domain. Every tile links to the
          screen its number is read from. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active accounts"
          value={String(users.length)}
          icon={Users}
          tint="blue"
          href="/staff/admin/users"
        />
        <StatCard
          label="Menu items"
          value={String(menuItems.length)}
          icon={BookOpen}
          tint="green"
          href="/staff/admin/menu"
        />
        <StatCard
          label="Categories"
          value={String(categories.length)}
          icon={Layers}
          tint="navy"
          sub="managed on the Menu page"
          href="/staff/admin/menu"
        />
        <StatCard
          label="Missing a recipe"
          value={String(missingRecipe)}
          icon={AlertTriangle}
          tint="amber"
          sub="availability not tracked"
          href="/staff/admin/menu-health"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Account overview */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold text-foreground">Accounts</CardTitle>
            <Link href="/staff/admin/access-review" className="text-xs font-medium text-primary hover:underline">
              Access review
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2.5">
              {ROLES.map((role) => {
                const u = usage[role] ?? { used: 0, limit: null };
                const pct = u.limit ? Math.min(100, (u.used / u.limit) * 100) : u.used > 0 ? 100 : 0;
                const full = u.limit !== null && u.used >= u.limit;
                return (
                  <div key={role} className="flex items-center gap-3">
                    <span className="w-24 flex-shrink-0 text-sm font-medium text-foreground">
                      {roleLabel(role)}
                    </span>
                    <div className="h-4 flex-1 overflow-hidden rounded-lg bg-muted">
                      <div
                        className={cn("h-full rounded-lg", full ? "bg-amber-500/80" : "bg-brand-blue/70")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-14 text-right text-xs text-muted-foreground">
                      {u.used}
                      {u.limit !== null ? ` / ${u.limit}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent logins
              </p>
              <div className="space-y-2">
                {recentLogins.map((u) => (
                  <div key={u.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-foreground">{u.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {roleLabel(u.role)} · {lastActiveLabel(u.lastActive)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Menu overview */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold text-foreground">Menu</CardTitle>
            <Link href="/staff/admin/menu-health" className="text-xs font-medium text-primary hover:underline">
              Menu health
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Live items", value: menuItems.length, tint: "text-brand-blue" },
                { label: "Archived", value: archivedItems.length, tint: "text-muted-foreground" },
                { label: "Promo / recommended", value: promos, tint: "text-emerald-600" },
                { label: "Categories", value: categories.length, tint: "text-brand-navy" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                  <p className={cn("text-2xl font-bold", s.tint)}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            <Link
              href="/staff/admin/menu-health"
              className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 transition-colors hover:bg-amber-100/70"
            >
              <span className="flex items-center gap-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                {missingRecipe} item{missingRecipe === 1 ? "" : "s"} missing a recipe
              </span>
              <ArrowUpRight className="h-4 w-4 text-amber-700" />
            </Link>

            {/* Both rows read off Menu Health, so both go there — same shape as
                the amber row above. */}
            <Link
              href="/staff/admin/menu-health"
              className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm transition-colors hover:bg-muted"
            >
              <span className="flex items-center gap-2 text-foreground/80">
                <XCircle className="h-4 w-4 text-red-500" />
                Currently unavailable
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{unavailable}</span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </span>
            </Link>
            <Link
              href="/staff/admin/menu-health"
              className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm transition-colors hover:bg-muted"
            >
              <span className="flex items-center gap-2 text-foreground/80">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                Promo / recommended
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{promos}</span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </span>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
