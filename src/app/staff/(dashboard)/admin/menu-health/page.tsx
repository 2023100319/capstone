import { getAdminMenuItems } from "@/app/actions/menu-admin";
import { MenuHealthTable, type MenuHealthRow } from "./menu-health-table";

export const dynamic = "force-dynamic";

export default async function MenuHealthPage() {
  const items = await getAdminMenuItems(false);

  // The health of each item is derived in the client component, from the
  // availability fields getAdminMenuItems already spreads onto every row.
  const rows: MenuHealthRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    categoryName: i.categoryName,
    price: i.price,
    isPromo: i.isPromo,
    isRecommended: i.isRecommended,
    hasRecipe: i.hasRecipe,
    tracksStock: i.tracksStock,
    unavailable: i.unavailable,
    canMake: i.canMake,
    blockedBy: i.blockedBy,
    lowStockAt: i.lowStockAt,
    unitLabel: i.unitLabel,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Menu Health</h1>
        <p className="text-sm text-muted-foreground">
          Setup gaps and availability across the {items.length} live menu items. Tap a card to
          filter the list.
        </p>
      </div>

      <MenuHealthTable rows={rows} />
    </div>
  );
}
