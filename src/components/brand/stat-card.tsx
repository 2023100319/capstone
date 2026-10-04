import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TINTS = {
  blue: "bg-blue-50 text-brand-blue",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  navy: "bg-slate-100 text-brand-navy",
} as const;

/**
 * The KPI tile used across the staff screens, in one of three modes.
 *
 * Plain, it is a `div`. With `onClick` it becomes a button that filters the list
 * beneath it (Menu Health, Menu Availability). With `href` it becomes a link to
 * the page the number came from — which is how the dashboards use it, since
 * those are server components and cannot hand a click handler across the
 * boundary. `onClick` and `href` are alternatives; passing both is a mistake and
 * the link wins.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tint = "blue",
  sub,
  onClick,
  href,
  active = false,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tint?: keyof typeof TINTS;
  sub?: string;
  /** Renders the card as a button. Used where the cards filter the list below. */
  onClick?: () => void;
  /** Renders the card as a link. Used where the card jumps to its own screen. */
  href?: string;
  /** Only meaningful alongside onClick — rings the filter currently applied. */
  active?: boolean;
}) {
  const interactive = Boolean(onClick || href);
  const className = cn(
    "flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-sm",
    interactive && "transition-colors hover:border-brand-navy/40 hover:bg-muted/40",
    active && "border-brand-navy ring-2 ring-brand-navy/20"
  );

  const body = (
    <>
      <div
        className={cn(
          "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl",
          TINTS[tint]
        )}
      >
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-2xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {/* Only the link form carries the arrow — a filter card goes nowhere. */}
      {href && <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  if (!onClick) return <div className={className}>{body}</div>;

  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={className}>
      {body}
    </button>
  );
}
