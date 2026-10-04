"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { OrderType } from "@prisma/client";

const STORAGE_KEY = "ericahlicious-cart";
// Kept apart from STORAGE_KEY rather than folded into it: that key holds a bare
// CartItem[] in carts already sitting in customers' browsers, and changing its
// shape would strand them.
const ORDER_KEY = "ericahlicious-cart-order";

/**
 * What the browser tracks. Deliberately does NOT carry the station or the
 * authoritative price — the server re-derives both from the database when the
 * order is placed.
 */
export type CartLine = {
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  orderType: OrderType;
  variation?: string;
  specialInstructions?: string;
  imageUrl?: string;
};

/** A cart line plus a stable key so variations of the same item stay separate. */
export type CartItem = CartLine & { lineId: string };

/**
 * The slip the current cart already produced.
 *
 * Placing an order no longer empties the cart, so without this a second press of
 * "Proceed to Order Summary" would book a twin of the order the customer is
 * holding. Matching on a content signature rather than clearing a flag on every
 * mutation means editing the cart and editing it back reuses the same order.
 */
export type PlacedOrder = { orderNumber: string; signature: string };

type CartContextValue = {
  items: CartItem[];
  totalItems: number;
  total: number;
  addItem: (item: CartLine) => void;
  updateQty: (lineId: string, delta: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
  /** Fingerprint of what's in the cart right now. */
  orderSignature: string;
  placedOrder: PlacedOrder | null;
  /** Pin an order number to the cart as it stands. */
  rememberPlacedOrder: (orderNumber: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/** Same product + variation + order type collapses into one line. */
function lineIdFor(item: CartLine) {
  return [item.menuItemId, item.variation ?? "", item.orderType].join("|");
}

/**
 * A fingerprint of the cart's contents, independent of line order — the array
 * order shifts as lines are removed and re-added, but that isn't a different
 * order. lineId already carries product + variation + order type, so only the
 * quantity and the note need adding. Price is left out: the server re-derives it.
 */
function signatureOf(items: CartItem[]) {
  return items
    .map((i) => `${i.lineId}~${i.qty}~${i.specialInstructions ?? ""}`)
    .sort()
    .join("|");
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);
  const [loaded, setLoaded] = useState(false);

  // The server has no localStorage, so it always renders an empty cart. Restoring has to
  // happen after hydration or the markup would mismatch — hence setState inside an effect.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setItems(JSON.parse(stored) as CartItem[]);
      const storedOrder = localStorage.getItem(ORDER_KEY);
      if (storedOrder) setPlacedOrder(JSON.parse(storedOrder) as PlacedOrder);
    } catch {
      // Corrupt or unavailable storage: start with an empty cart.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (placedOrder) localStorage.setItem(ORDER_KEY, JSON.stringify(placedOrder));
    else localStorage.removeItem(ORDER_KEY);
  }, [placedOrder, loaded]);

  const addItem = useCallback((item: CartLine) => {
    const lineId = lineIdFor(item);
    setItems((prev) => {
      const existing = prev.find((i) => i.lineId === lineId);
      if (existing) {
        return prev.map((i) =>
          i.lineId === lineId ? { ...i, qty: i.qty + item.qty } : i
        );
      }
      return [...prev, { ...item, lineId }];
    });
  }, []);

  const updateQty = useCallback((lineId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.lineId === lineId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((i) => i.lineId !== lineId));
  }, []);

  // No longer called when an order is placed — the cart deliberately survives
  // that now. Kept because it is the only way to empty the cart outright.
  const clear = useCallback(() => {
    setItems([]);
    setPlacedOrder(null);
  }, []);

  const orderSignature = useMemo(() => signatureOf(items), [items]);

  const rememberPlacedOrder = useCallback(
    (orderNumber: string) => setPlacedOrder({ orderNumber, signature: signatureOf(items) }),
    [items]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      totalItems: items.reduce((sum, i) => sum + i.qty, 0),
      total: items.reduce((sum, i) => sum + i.price * i.qty, 0),
      addItem,
      updateQty,
      removeItem,
      clear,
      orderSignature,
      placedOrder,
      rememberPlacedOrder,
    }),
    [
      items,
      addItem,
      updateQty,
      removeItem,
      clear,
      orderSignature,
      placedOrder,
      rememberPlacedOrder,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
