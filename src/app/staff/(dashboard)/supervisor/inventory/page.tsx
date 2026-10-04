import {
  getInventory,
  getInventoryCategories,
  getRecipes,
  getStockCountedItems,
} from "@/app/actions/inventory";
import { currentUser } from "@/lib/guards";
import { can } from "@/lib/roles";
import { InventoryManager } from "./inventory-manager";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  const [items, categories, recipes, counted, actor] = await Promise.all([
    getInventory(showArchived),
    // The archived view shows archived categories alongside archived
    // ingredients, the same way the Menu screen pairs the two.
    getInventoryCategories(showArchived),
    getRecipes(),
    getStockCountedItems(showArchived),
    currentUser(),
  ]);

  // The Recipes tab always picks from live ingredients, even while the table
  // beside it is showing the archived ones.
  const ingredients = showArchived ? await getInventory() : items;

  const forClient = (list: typeof items) =>
    list.map((i) => ({
      ...i,
      expiryDate: i.expiryDate ? i.expiryDate.toISOString().slice(0, 10) : "",
    }));

  return (
    <InventoryManager
      items={forClient(items)}
      ingredients={forClient(ingredients)}
      categories={categories.map((c) => ({ id: c.id, name: c.name, station: c.station }))}
      recipes={recipes}
      counted={counted}
      canManage={can(actor?.role, "manageInventory")}
      showArchived={showArchived}
    />
  );
}
