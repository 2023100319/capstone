"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import {
  OrderQueueCard,
  type QueueOrder,
  type QueueStatus,
} from "./order-queue-card";
import { updateOrderStatus } from "@/app/actions/orders";

const STATUS_FLOW: Record<QueueStatus, QueueStatus | null> = {
  PENDING: "PREPARING",
  PREPARING: "READY",
  READY: null,
};

const ACTION_LABELS: Partial<Record<QueueStatus, string>> = {
  PENDING: "Mark as Preparing",
  PREPARING: "Mark as Ready",
};

const TABS: QueueStatus[] = ["PENDING", "PREPARING", "READY"];

const POLL_INTERVAL_MS = 5000;

export function StationDisplay({
  station,
  icon: Icon,
  orders,
}: {
  station: string;
  icon: LucideIcon;
  orders: QueueOrder[];
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<QueueStatus>("PENDING");
  const [isPending, startTransition] = useTransition();

  // Poll for orders placed by customers while this screen is open.
  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  function advance(orderId: string, currentStatus: QueueStatus) {
    const next = STATUS_FLOW[currentStatus];
    if (!next) return;
    startTransition(async () => {
      await updateOrderStatus(orderId, next);
      router.refresh();
    });
  }

  const filtered = orders.filter((o) => o.status === activeTab);
  const counts = Object.fromEntries(
    TABS.map((tab) => [tab, orders.filter((o) => o.status === tab).length])
  ) as Record<QueueStatus, number>;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 shadow-sm sm:px-8">
        <div className="flex items-center gap-3">
          <BrandLogo variant="staff" size={40} />
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              <Icon className="h-4 w-4 text-muted-foreground" />
              {station}
            </p>
            <p className="text-xs text-muted-foreground">{session?.user?.name ?? "…"}</p>
          </div>
        </div>
        <button
          // The kitchen role was retired, so it has no login screen of its own —
          // out to the public site.
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Log Out
        </button>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-8">
        <h1 className="mb-6 text-2xl font-bold text-foreground">Order Queue</h1>

        <div className="mb-6 flex gap-3 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-shrink-0 rounded-xl border-2 bg-card px-5 py-2.5 text-sm font-semibold shadow-sm transition-all",
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
              {counts[tab] > 0 && (
                <span
                  className={cn(
                    "ml-2 rounded-full px-1.5 py-0.5 text-xs font-bold",
                    activeTab === tab
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {counts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div
          className={cn(
            "grid grid-cols-1 gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-3",
            isPending && "opacity-60"
          )}
        >
          {filtered.length === 0 ? (
            <div className="col-span-full py-16 text-center text-muted-foreground">
              No orders in this queue.
            </div>
          ) : (
            filtered.map((order) => (
              <OrderQueueCard
                key={order.id}
                order={order}
                actionLabel={ACTION_LABELS[order.status]}
                onAction={() => advance(order.id, order.status)}
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
