import { getAdminMenuItems } from "@/app/actions/menu-admin";
import { getMenuCategories } from "@/app/actions/menu";
import { getInventory } from "@/app/actions/inventory";
import { currentUser } from "@/lib/guards";
import { can } from "@/lib/roles";
import { MenuManager } from "./menu-manager";

export const dynamic = "force-dynamic";

export default async function MenuManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  const [items, categories, inventory, actor] = await Promise.all([
    getAdminMenuItems(showArchived),
    // Archived view lists archived categories (to restore); otherwise active ones.
    getMenuCategories(showArchived),
    // The ingredient picker only offers what the store actually stocks.
    getInventory(),
    currentUser(),
  ]);

  return (
    <MenuManager
      items={items}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        // Sets the default stock mode for a new item in this category.
        tracksStockDirectly: c.tracksStockDirectly,
      }))}
      ingredients={inventory.map((i) => ({
        id: i.id,
        ingredientName: i.ingredientName,
        unit: i.unit,
        stockQuantity: i.stockQuantity,
      }))}
      showArchived={showArchived}
      canManage={can(actor?.role, "manageMenu")}
    />
  );
}
