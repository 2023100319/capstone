import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { getOrderByNumber } from "@/app/actions/orders";
import { BrandLogo } from "@/components/brand/brand-logo";
import type { OrderLineItem } from "@/types/order";

export const dynamic = "force-dynamic";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export default async function OrderSummaryPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await getOrderByNumber(decodeURIComponent(orderNumber));

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <BrandLogo variant="customer" size={64} />
        <h1 className="mt-4 font-serif text-xl font-bold text-primary">Order not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We couldn&apos;t find that order. Please place a new one.
        </p>
        <Link
          href="/menu"
          className="mt-6 rounded-xl bg-primary px-8 py-3 font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-brand-brown-dark active:scale-[.98]"
        >
          Back to menu
        </Link>
      </div>
    );
  }

  const items = (order.items as unknown as OrderLineItem[]) ?? [];
  const totalItems = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <div className="flex min-h-screen flex-col items-center bg-background p-4 sm:justify-center sm:p-6">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-lg">
        {/* Brand header */}
        <div className="relative bg-gradient-to-b from-brand-brown-dark to-primary px-6 pt-7 pb-7 text-center">
          <div className="flex flex-col items-center">
            <BrandLogo variant="customer" size={44} className="ring-2 ring-white/30" />
            <p className="mt-2 font-serif text-xl font-bold text-white">Ericahlicious</p>
            <p className="font-serif text-xs italic text-white/70">Brew &amp; Bake</p>
          </div>
        </div>

        <div className="p-5">
          {/* Ordered at. The order number, status and branch used to sit above
              this; none of them is acted on, and the slip is good at any
              Ericahlicious store, so the notice below carries that instead. */}
          <div className="border-b border-border py-4 text-center">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Ordered At
            </p>
            <p className="mt-0.5 text-sm text-foreground">
              {order.createdAt.toLocaleString("en-PH", DATE_FORMAT)}
            </p>
          </div>

          {/* Items */}
          <div className="py-4">
            <p className="mb-3 border-l-2 border-primary pl-2 text-xs font-bold tracking-wider text-primary uppercase">
              Order Items
            </p>
            <ul>
              {items.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0"
                >
                  <span className="text-sm text-foreground">
                    {item.name}
                    {item.variation && (
                      <span className="text-muted-foreground"> ({item.variation})</span>
                    )}
                  </span>
                  <span className="flex-shrink-0 rounded-md bg-brand-cream px-2 py-0.5 text-xs font-semibold text-primary">
                    ×{item.qty}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Totals */}
          <div className="space-y-2 border-t-2 border-primary/20 pt-3">
            <div className="flex justify-between text-sm">
              <span className="font-semibold tracking-wide text-muted-foreground uppercase">
                Total Items
              </span>
              <span className="font-bold text-foreground">{totalItems}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-sm">
              <span className="font-semibold tracking-wide text-muted-foreground uppercase">
                Total Price
              </span>
              <span className="text-lg font-bold text-primary">₱{order.totalAmount}</span>
            </div>
          </div>

          {/* Notice */}
          <div className="mt-5 flex items-start gap-2 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2.5">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
            <p className="text-xs text-amber-800">
              Please present this to the cashier for payment.
            </p>
          </div>

          {/* Actions */}
          <div className="mt-5 space-y-2.5">
            <Link
              href="/cart"
              className="block w-full rounded-lg bg-primary py-3 text-center text-sm font-bold tracking-wide text-primary-foreground uppercase shadow-md shadow-primary/20 transition-all hover:bg-brand-brown-dark active:scale-[.98]"
            >
              Back to Cart
            </Link>
            <Link
              href="/menu"
              className="block w-full rounded-lg bg-emerald-600 py-3 text-center text-sm font-bold tracking-wide text-white uppercase shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-[.98]"
            >
              Back to Menu
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
