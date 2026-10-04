"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Printer, Download, ShoppingCart, CalendarClock, AlertCircle } from "lucide-react";
import type { InventoryStatus } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { markExpired } from "@/app/actions/inventory";
import { cn } from "@/lib/utils";

type ReorderRow = {
  id: string;
  ingredientName: string;
  categoryName: string;
  stockQuantity: number;
  reorderLevel: number;
  unit: string;
  supplier: string;
  status: InventoryStatus;
  suggestedOrder: number;
};

type ExpiringRow = {
  id: string;
  ingredientName: string;
  categoryName: string;
  stockQuantity: number;
  unit: string;
  expiryDate: string;
  daysLeft: number;
  expired: boolean;
};

const STATUS_STYLE: Record<InventoryStatus, string> = {
  GOOD: "bg-emerald-50 text-emerald-700",
  LOW: "bg-amber-50 text-amber-700",
  OUT_OF_STOCK: "bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<InventoryStatus, string> = {
  GOOD: "Good",
  LOW: "Low",
  OUT_OF_STOCK: "Out of Stock",
};

export function StockAlerts({
  reorder,
  expiring,
  canManage,
}: {
  reorder: ReorderRow[];
  expiring: ExpiringRow[];
  canManage: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const inventoryHref = pathname.replace(/\/alerts$/, "");
  const [expiringItem, setExpiringItem] = useState<ExpiringRow | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function confirmExpired() {
    if (!expiringItem) return;
    setError("");
    startTransition(async () => {
      const result = await markExpired(expiringItem.id, "Expired");
      if (!result.success) {
        setError(result.error);
        return;
      }
      setExpiringItem(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={inventoryHref}
            className="mb-1 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Inventory
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Reorder &amp; Expiry Alerts</h1>
        </div>
      </div>

      {/* Needs Reordering — the shopping list */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            Needs Reordering ({reorder.length})
          </CardTitle>
          {reorder.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              <a
                href="/api/inventory/reorder"
                className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
              >
                <Download className="h-4 w-4" /> Download .xlsx
              </a>
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {reorder.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              Everything is above its reorder level. Nothing to buy right now.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Ingredient", "Category", "On hand", "Reorder level", "Suggested order", "Supplier", "Status"].map((h) => (
                    <th key={h} className="px-6 py-3 text-left font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reorder.map((r) => (
                  <tr key={r.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-6 py-4 font-medium text-foreground">{r.ingredientName}</td>
                    <td className="px-6 py-4 text-foreground/80">{r.categoryName}</td>
                    <td className="px-6 py-4 text-foreground/80">
                      {r.stockQuantity.toLocaleString()} {r.unit}
                    </td>
                    <td className="px-6 py-4 text-foreground/80">
                      {r.reorderLevel.toLocaleString()} {r.unit}
                    </td>
                    <td className="px-6 py-4 font-semibold text-foreground">
                      {r.suggestedOrder.toLocaleString()} {r.unit}
                    </td>
                    <td className="px-6 py-4 text-foreground/80">{r.supplier || "—"}</td>
                    <td className="px-6 py-4">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", STATUS_STYLE[r.status])}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Expiring Soon — the dashboards' "Expiring in 7 days" tiles link
          straight here, so the anchor needs clearance under the sticky header. */}
      <Card id="expiring" className="scroll-mt-20 border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Expiring Soon ({expiring.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {expiring.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              Nothing expires within the next 7 days.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Ingredient", "Category", "On hand", "Expiry date", "Days left"].map((h) => (
                    <th key={h} className="px-6 py-3 text-left font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                  {canManage && (
                    <th className="px-6 py-3 text-left font-medium text-muted-foreground">Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {expiring.map((e) => (
                  <tr key={e.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-6 py-4 font-medium text-foreground">{e.ingredientName}</td>
                    <td className="px-6 py-4 text-foreground/80">{e.categoryName}</td>
                    <td className="px-6 py-4 text-foreground/80">
                      {e.stockQuantity.toLocaleString()} {e.unit}
                    </td>
                    <td className="px-6 py-4 text-foreground/80">
                      {new Date(e.expiryDate).toLocaleDateString("en-PH")}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                          e.expired ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                        )}
                      >
                        {e.expired && <AlertCircle className="h-3 w-3" />}
                        {e.expired
                          ? `Expired ${Math.abs(e.daysLeft)}d ago`
                          : e.daysLeft === 0
                            ? "Today"
                            : `${e.daysLeft}d`}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <button
                          onClick={() => {
                            setError("");
                            setExpiringItem(e);
                          }}
                          disabled={isPending || e.stockQuantity <= 0}
                          className="flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                        >
                          Mark Expired
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        title="Mark as expired"
        open={expiringItem !== null}
        onClose={() => setExpiringItem(null)}
        onConfirm={confirmExpired}
        confirmLabel="Mark expired"
        busy={isPending}
        error={error}
        message={
          <>
            This writes off all{" "}
            <strong className="text-foreground">
              {expiringItem?.stockQuantity.toLocaleString()} {expiringItem?.unit}
            </strong>{" "}
            of <strong className="text-foreground">{expiringItem?.ingredientName}</strong>, setting
            its stock to zero and logging an Expiry entry in Stock History.
          </>
        }
      />
    </div>
  );
}
