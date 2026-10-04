"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type QueueStatus = "PENDING" | "PREPARING" | "READY";

export type QueueOrder = {
  id: string;
  code: string;
  orderType: string;
  status: QueueStatus;
  items: { name: string; qty: number }[];
};

const STATUS_STYLES: Record<
  QueueStatus,
  { accent: string; badge: string; label: string }
> = {
  PENDING: {
    accent: "border-t-amber-400",
    badge: "bg-amber-50 text-amber-700",
    label: "Pending",
  },
  PREPARING: {
    accent: "border-t-brand-blue",
    badge: "bg-blue-50 text-brand-blue",
    label: "Preparing",
  },
  READY: {
    accent: "border-t-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
    label: "Ready",
  },
};

export function OrderQueueCard({
  order,
  actionLabel,
  onAction,
}: {
  order: QueueOrder;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const style = STATUS_STYLES[order.status];
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-border border-t-4 bg-card p-5 shadow-sm",
        style.accent
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-foreground">{order.code}</p>
          <p className="text-xs text-muted-foreground">{order.orderType}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            style.badge
          )}
        >
          {style.label}
        </span>
      </div>

      <ul className="mb-5 space-y-2">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-foreground">{item.name}</span>
            <span className="font-bold text-foreground">{item.qty}x</span>
          </li>
        ))}
      </ul>

      {actionLabel && (
        <button
          onClick={onAction}
          className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-brand-blue-dark active:scale-[.98]"
        >
          {actionLabel}
          {order.status === "PREPARING" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}
