"use client";

import { useState } from "react";
import { ShoppingCart, Trash2, Loader2, ReceiptText } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { CustomerHeader } from "@/components/brand/customer-header";
import { useCart } from "@/lib/cart-store";
import { createOrder, isOrderReusable } from "@/app/actions/orders";

export default function CartPage() {
  const router = useRouter();
  const { items, total, updateQty, removeItem, orderSignature, placedOrder, rememberPlacedOrder } =
    useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // This cart has already been turned into a slip and hasn't been touched since.
  // Drives the notice below; the button re-checks with the server before acting.
  const alreadyPlaced = placedOrder?.signature === orderSignature;

  async function placeOrder() {
    setSubmitting(true);
    setError("");

    // Placing an order no longer empties the cart, so the customer can land back
    // here holding a slip. Send them to that same slip rather than booking a twin
    // of it — but only while the order is still open, since they may have paid it
    // at the counter in the meantime.
    if (placedOrder && alreadyPlaced && (await isOrderReusable(placedOrder.orderNumber))) {
      router.push(`/order/${placedOrder.orderNumber}`);
      return;
    }

    // Send only what the customer actually chose — the server re-derives the
    // name, price, and station from the database.
    const result = await createOrder(
      items.map((item) => ({
        menuItemId: item.menuItemId,
        qty: item.qty,
        orderType: item.orderType,
        variation: item.variation,
        specialInstructions: item.specialInstructions,
      }))
    );

    if (!result.success) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    rememberPlacedOrder(result.orderNumber);
    router.push(`/order/${result.orderNumber}`);
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <CustomerHeader title="Your Cart" backHref="/menu" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
          <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-brand-cream-dark/60">
            <ShoppingCart className="h-10 w-10 text-primary/50" strokeWidth={1.5} />
          </div>
          <p className="font-serif text-xl font-bold text-primary">Your Cart is Empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse our menu and add your favorites
          </p>
          <Link
            href="/menu"
            className="mt-6 rounded-xl bg-primary px-8 py-3 font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-brand-brown-dark active:scale-[.98]"
          >
            Browse menu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <CustomerHeader title="Your Cart" backHref="/menu" />

      {/* Items */}
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-3 px-4 py-5 sm:px-6">
        {items.map((item) => (
          <div
            key={item.lineId}
            className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4"
          >
            {item.imageUrl && (
              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl sm:h-20 sm:w-20">
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-primary sm:text-base">
                {item.name}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-block rounded-full bg-brand-cream-dark/70 px-2 py-0.5 text-xs text-primary">
                  {item.orderType === "DINE_IN" ? "Dine-In" : "Take Out"}
                </span>
                {item.variation && (
                  <span className="inline-block rounded-full bg-brand-cream-dark/70 px-2 py-0.5 text-xs text-primary">
                    {item.variation}
                  </span>
                )}
              </div>
              {item.specialInstructions && (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {item.specialInstructions}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 sm:gap-2 sm:px-3">
                <button
                  onClick={() => updateQty(item.lineId, -1)}
                  aria-label="Decrease quantity"
                  className="w-4 text-center text-sm font-bold text-primary transition-transform active:scale-90 sm:w-5"
                >
                  −
                </button>
                <span className="min-w-4 text-center text-sm font-medium text-foreground">
                  {item.qty}
                </span>
                <button
                  onClick={() => updateQty(item.lineId, 1)}
                  aria-label="Increase quantity"
                  className="w-4 text-center text-sm font-bold text-primary transition-transform active:scale-90 sm:w-5"
                >
                  +
                </button>
              </div>
              <p className="w-14 text-right text-sm font-bold text-primary sm:w-16 sm:text-base">
                ₱{item.price * item.qty}
              </p>
              <button
                onClick={() => removeItem(item.lineId)}
                aria-label={`Remove ${item.name}`}
                className="rounded-full p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 border-t border-primary/10 bg-brand-cream/90 backdrop-blur-md">
        <div className="mx-auto w-full max-w-2xl px-4 pt-3 pb-6 sm:px-6">
          {/* Without this the cart just looks like the order never went through:
              the items are all still sitting there. Says which slip they already
              hold, and disappears the moment the cart is edited — at which point
              Proceed really will create a new order. */}
          {placedOrder && alreadyPlaced && (
            <Link
              href={`/order/${placedOrder.orderNumber}`}
              className="mb-3 flex items-start gap-2 rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2.5 transition-colors hover:bg-amber-100"
            >
              <ReceiptText className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <span className="text-xs text-amber-800">
                You already have an order slip for this cart —{" "}
                <span className="font-semibold">{placedOrder.orderNumber}</span>. Tap to view
                it, or change your items below to place a new one.
              </span>
            </Link>
          )}
          <div className="mb-4 flex justify-between">
            <span className="font-medium text-foreground">Total</span>
            <span className="text-lg font-bold text-primary">₱{total}</span>
          </div>
          {error && <p className="mb-2 text-center text-xs text-destructive">{error}</p>}
          <button
            onClick={placeOrder}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-brand-brown-dark active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Placing your order...
              </>
            ) : (
              "Proceed to Order Summary"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
