"use client";

import { useState } from "react";
import { ShoppingCart, Search, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { OrderType } from "@prisma/client";
import { CustomerHeader } from "@/components/brand/customer-header";
import { CategoryPill } from "@/components/brand/category-pill";
import { MenuItemCard } from "@/components/brand/menu-item-card";
import { useCart } from "@/lib/cart-store";

/** Decoration only — a category added later simply gets no emoji. */
const CATEGORY_EMOJI: Record<string, string> = {
  Pasta: "🍝",
  "Rice Meals": "🍚",
  "Coffee / Iced Drinks": "☕",
  "Pica-Pica / Snacks": "🍟",
  Cakes: "🎂",
  "Sweet Drinks": "🧋",
};

const FIXED_TABS = [
  { id: "recommendation", label: "Recommendation", emoji: "⭐" },
  { id: "promos", label: "Promos", emoji: "🌟" },
  { id: "all", label: "All", emoji: null as string | null },
];

export type MenuBrowserItem = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  originalPrice: number | null;
  isPromo: boolean;
  isRecommended: boolean;
  imageUrl: string;
  hasVariation: boolean;
  variations: { label: string; price: number }[];
  soldOut: boolean;
  /** Ingredients that ran out. Empty when the item simply has no stock left. */
  blockedBy: string[];
};

export function MenuBrowser({
  items,
  categories,
}: {
  items: MenuBrowserItem[];
  categories: { id: string; name: string }[];
}) {
  const cart = useCart();
  const tabs = [
    ...FIXED_TABS,
    ...categories.map((c) => ({
      id: c.id,
      label: c.name,
      emoji: CATEGORY_EMOJI[c.name] ?? null,
    })),
  ];
  const [activeCategory, setActiveCategory] = useState("recommendation");
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuBrowserItem | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("DINE_IN");
  const [selectedVariation, setSelectedVariation] = useState<string | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [qty, setQty] = useState(1);

  const filteredItems = items.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (activeCategory === "recommendation") return item.isRecommended;
    if (activeCategory === "promos") return item.isPromo;
    if (activeCategory === "all") return true;
    return item.categoryId === activeCategory;
  });

  /**
   * The page opens on Recommendation, so a search used to run inside that tab
   * and come back empty for anything not recommended. Typing switches to "All"
   * instead of quietly searching everything, so the highlighted pill always
   * matches the rows below. Clearing the box leaves you on All — the pill you
   * see stays the pill that applies.
   */
  function changeSearch(value: string) {
    setSearch(value);
    if (value.trim() !== "") setActiveCategory("all");
  }

  function openModal(item: MenuBrowserItem) {
    setSelectedItem(item);
    setOrderType("DINE_IN");
    setSelectedVariation(item.variations[0]?.label ?? null);
    setSpecialInstructions("");
    setQty(1);
  }

  function getItemPrice() {
    if (!selectedItem) return 0;
    if (selectedItem.hasVariation && selectedVariation) {
      const v = selectedItem.variations.find((v) => v.label === selectedVariation);
      return v ? v.price : selectedItem.price;
    }
    return selectedItem.price;
  }

  function addToCart() {
    if (!selectedItem) return;
    cart.addItem({
      menuItemId: selectedItem.id,
      name: selectedItem.name,
      price: getItemPrice(),
      qty,
      orderType,
      variation: selectedVariation ?? undefined,
      specialInstructions: specialInstructions || undefined,
      imageUrl: selectedItem.imageUrl,
    });
    setSelectedItem(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <CustomerHeader title="Menu" backHref="/" showCart cartCount={cart.totalItems}>
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-primary/50" />
          <input
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            placeholder="Search menu..."
            className="w-full rounded-full border border-primary/10 bg-brand-cream-dark/60 py-2.5 pr-4 pl-10 text-sm text-primary placeholder-primary/40 transition-shadow focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none md:flex-wrap md:overflow-visible">
          {tabs.map((cat) => (
            <CategoryPill
              key={cat.id}
              active={activeCategory === cat.id}
              onClick={() => setActiveCategory(cat.id)}
              emoji={cat.emoji}
            >
              {cat.label}
            </CategoryPill>
          ))}
        </div>
      </CustomerHeader>

      {/* Menu Items */}
      <div className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 sm:px-6 lg:px-8">
        {filteredItems.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">No items found.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => (
              <MenuItemCard key={item.id} item={item} onAdd={() => openModal(item)} />
            ))}
          </div>
        )}
      </div>

      {/* Floating cart bar */}
      {cart.totalItems > 0 && !selectedItem && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4 sm:bottom-6 sm:flex sm:justify-center sm:p-0">
          <Link
            href="/cart"
            className="flex items-center justify-between gap-4 rounded-2xl bg-primary px-5 py-3.5 text-primary-foreground shadow-2xl shadow-primary/30 transition-transform active:scale-[.98] sm:w-full sm:max-w-md sm:rounded-full"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="h-5 w-5" />
              View Cart ({cart.totalItems})
            </span>
            <span className="text-sm font-bold">₱{cart.total}</span>
          </Link>
        </div>
      )}

      {/* Item Detail Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-6"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-52 sm:h-60">
              <Image
                src={selectedItem.imageUrl}
                alt={selectedItem.name}
                fill
                sizes="(max-width: 640px) 100vw, 512px"
                className="object-cover"
              />
              <button
                onClick={() => setSelectedItem(null)}
                aria-label="Close"
                className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow transition-colors hover:bg-white"
              >
                <X className="h-4 w-4 text-primary" />
              </button>
            </div>

            <div className="p-5 sm:p-6">
              <h2 className="font-serif text-xl font-bold text-primary sm:text-2xl">
                {selectedItem.name}
              </h2>
              {selectedItem.description && (
                <p className="mt-1 text-sm text-muted-foreground">{selectedItem.description}</p>
              )}
              <p className="mt-2 text-xl font-bold text-primary">₱{getItemPrice()}</p>

              {/* Order Type Toggle */}
              <div className="mt-4 flex gap-2">
                {(["DINE_IN", "TAKE_OUT"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setOrderType(type)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      orderType === type
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "bg-brand-cream-dark/70 text-primary hover:bg-brand-cream-dark"
                    }`}
                  >
                    {type === "DINE_IN" ? "Dine In" : "Take Out"}
                  </button>
                ))}
              </div>

              {/* Variation */}
              {selectedItem.hasVariation && selectedItem.variations.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 font-serif text-sm font-bold text-primary">Variation</p>
                  {selectedItem.variations.map((v) => (
                    <button
                      key={v.label}
                      onClick={() => setSelectedVariation(v.label)}
                      className="flex w-full items-center justify-between border-b border-border/60 py-2.5"
                    >
                      <span className="text-sm text-foreground">{v.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground">₱{v.price}</span>
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                            selectedVariation === v.label ? "border-primary" : "border-border"
                          }`}
                        >
                          {selectedVariation === v.label && (
                            <div className="h-3 w-3 rounded-full bg-primary" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Special Instructions */}
              <div className="mt-5">
                <p className="font-serif text-sm font-bold text-primary">Special instructions</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Special requests are subject to the restaurant&apos;s approval. Tell us here!
                </p>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="e.g. No mayo"
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-border bg-brand-cream/40 p-3 text-sm text-foreground placeholder-primary/30 transition-shadow focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </div>

              {/* Qty + Add to Cart */}
              <div className="mt-6 flex items-center gap-3">
                <div className="flex items-center gap-3 rounded-full border border-border px-3 py-2">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                    className="w-6 text-center text-lg font-bold text-primary transition-transform active:scale-90"
                  >
                    −
                  </button>
                  <span className="min-w-4 text-center font-semibold text-foreground">{qty}</span>
                  <button
                    onClick={() => setQty((q) => q + 1)}
                    aria-label="Increase quantity"
                    className="w-6 text-center text-lg font-bold text-primary transition-transform active:scale-90"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={addToCart}
                  className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-brand-brown-dark active:scale-[.98]"
                >
                  Add To Cart − ₱{getItemPrice() * qty}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
