"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, CheckCircle2 } from "lucide-react";
import type { PaymentMethod } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { payOrder } from "@/app/actions/orders";
import { cn } from "@/lib/utils";

type PendingOrder = {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  totalAmount: number;
  items: { name: string; qty: number; price: number; variation?: string }[];
};

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "GCASH", "CARD"];

export function PaymentTerminal({ orders }: { orders: PendingOrder[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PendingOrder | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = orders.filter((o) =>
    o.orderNumber.toLowerCase().includes(search.toLowerCase())
  );

  function takePayment() {
    if (!selected) return;

    setError("");
    startTransition(async () => {
      const result = await payOrder(selected.id, method);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSelected(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Payment</h1>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type order no. (e.g. ORD-NQLJP7)"
            className="w-full rounded-lg bg-card py-2 pr-4 pl-9 text-sm text-foreground shadow-sm ring-1 ring-border transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50 sm:w-72"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Unpaid orders */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">
              Unpaid Orders ({filtered.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                {orders.length === 0
                  ? "No unpaid orders right now."
                  : "No order matches that number."}
              </p>
            ) : (
              filtered.map((order) => (
                <button
                  key={order.id}
                  onClick={() => {
                    setSelected(order);
                    setError("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between border-b px-6 py-4 text-left transition-colors last:border-0 hover:bg-muted/50",
                    selected?.id === order.id && "bg-primary/5"
                  )}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.orderType === "DINE_IN" ? "Dine In" : "Take Out"} ·{" "}
                      {order.items.reduce((sum, i) => sum + i.qty, 0)} items
                    </p>
                  </div>
                  <p className="text-sm font-bold text-foreground">₱{order.totalAmount}</p>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Selected order + payment */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">
              {selected ? `Order ${selected.orderNumber}` : "Select an order"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Pick an order from the list, or type the order number shown on the
                customer&apos;s order summary above.
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {selected.items.map((item, i) => (
                    <li key={i} className="flex justify-between gap-3 text-sm">
                      <span className="text-foreground">
                        {item.qty}× {item.name}
                        {item.variation && (
                          <span className="text-muted-foreground"> ({item.variation})</span>
                        )}
                      </span>
                      <span className="font-medium text-foreground">
                        ₱{item.price * item.qty}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex justify-between border-t border-border pt-3 text-base font-bold text-foreground">
                  <span>Total</span>
                  <span>₱{selected.totalAmount}</span>
                </div>

                <p className="mt-5 mb-2 text-sm font-medium text-foreground">Payment method</p>
                <div className="flex gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={cn(
                        "flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                        method === m
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {m === "GCASH" ? "GCash" : m.charAt(0) + m.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>

                {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

                <button
                  onClick={takePayment}
                  disabled={isPending}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-brand-blue-dark active:scale-[.99] disabled:opacity-60"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Recording payment...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Mark as Paid — ₱{selected.totalAmount}
                    </>
                  )}
                </button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
