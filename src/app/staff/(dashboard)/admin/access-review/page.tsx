import { Users, UserCheck, Moon, Archive } from "lucide-react";
import { getUsers, getRoleUsage } from "@/app/actions/users";
import { ROLES } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/brand/stat-card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DORMANT_DAYS = 14;
const roleLabel = (role: string) => role.charAt(0) + role.slice(1).toLowerCase();

function daysSince(date: Date) {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function lastActiveLabel(days: number) {
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export default async function AccessReviewPage() {
  const [active, archived, usage] = await Promise.all([
    getUsers(false),
    getUsers(true),
    getRoleUsage(),
  ]);

  const withActivity = active
    .map((u) => ({ ...u, idleDays: daysSince(u.lastActive) }))
    .sort((a, b) => b.idleDays - a.idleDays);
  const dormant = withActivity.filter((u) => u.idleDays >= DORMANT_DAYS).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Access Review</h1>
        <p className="text-sm text-muted-foreground">
          Account activity and role usage across the system.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active accounts" value={String(active.length)} icon={UserCheck} tint="green" />
        <StatCard
          label="Dormant"
          value={String(dormant)}
          icon={Moon}
          tint="amber"
          sub={`no activity in ${DORMANT_DAYS}+ days`}
        />
        <StatCard label="Archived" value={String(archived.length)} icon={Archive} tint="navy" />
        <StatCard
          label="Total accounts"
          value={String(active.length + archived.length)}
          icon={Users}
          tint="blue"
        />
      </div>

      {/* Role usage vs the caps in ROLE_LIMITS. */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Role usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ROLES.map((role) => {
            const u = usage[role] ?? { used: 0, limit: null };
            const pct = u.limit ? Math.min(100, (u.used / u.limit) * 100) : u.used > 0 ? 100 : 0;
            const full = u.limit !== null && u.used >= u.limit;
            return (
              <div key={role} className="flex items-center gap-3">
                <span className="w-28 flex-shrink-0 text-sm font-medium text-foreground">
                  {roleLabel(role)}
                </span>
                <div className="h-5 flex-1 overflow-hidden rounded-lg bg-muted">
                  <div
                    className={cn("h-full rounded-lg", full ? "bg-amber-500/80" : "bg-brand-blue/70")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-16 text-right text-sm text-muted-foreground">
                  {u.used}
                  {u.limit !== null ? ` / ${u.limit}` : ""}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Accounts by last activity — dormant ones bubble to the top. */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">
            Account activity ({active.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {["Name", "Employee ID", "Username", "Role", "Last active"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withActivity.map((u) => (
                <tr key={u.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                  <td className="px-6 py-3 font-medium text-foreground">{u.name}</td>
                  <td className="px-6 py-3 text-foreground/80">{u.employeeId}</td>
                  <td className="px-6 py-3 text-foreground/80">{u.username}</td>
                  <td className="px-6 py-3 text-foreground/80">{roleLabel(u.role)}</td>
                  <td className="px-6 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                        u.idleDays >= DORMANT_DAYS
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                      )}
                    >
                      {u.idleDays >= DORMANT_DAYS && <Moon className="h-3 w-3" />}
                      {lastActiveLabel(u.idleDays)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
