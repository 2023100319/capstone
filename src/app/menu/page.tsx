import type { Metadata } from "next";
import { getMenuItems, getMenuCategories } from "@/app/actions/menu";
import { menuAvailability } from "@/lib/availability";
import { MenuBrowser, type MenuBrowserItem } from "./menu-browser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "Browse the Ericahlicious menu — coffee, iced drinks, pasta, rice meals, snacks, and cakes. " +
    "Order ahead and pick up at any of our six branches across Bulacan and Valenzuela.",
};

export default async function MenuPage() {
  const [items, categories] = await Promise.all([getMenuItems(), getMenuCategories()]);

  const menuItems: MenuBrowserItem[] = items.map((item) => {
    // Cooked-to-order items are gated by their ingredients; pre-made ones by
    // their own count. blockedBy tells the customer WHICH ingredient ran out.
    const { unavailable, blockedBy } = menuAvailability(item);
    return {
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      categoryId: item.categoryId,
      price: item.price,
      originalPrice: item.originalPrice,
      isPromo: item.isPromo,
      isRecommended: item.isRecommended,
      imageUrl: item.imageUrl ?? "",
      hasVariation: item.hasVariation,
      variations: (item.variations as { label: string; price: number }[] | null) ?? [],
      soldOut: unavailable,
      blockedBy,
    };
  });

  return (
    <MenuBrowser
      items={menuItems}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
