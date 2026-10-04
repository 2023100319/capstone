import { getRecipes } from "@/app/actions/inventory";
import { MenuAvailability } from "./menu-availability";

export const dynamic = "force-dynamic";

export default async function MenuAvailabilityPage() {
  const recipes = await getRecipes();

  return (
    <MenuAvailability
      dishes={recipes.map((r) => ({
        id: r.id,
        name: r.name,
        categoryName: r.categoryName,
        hasRecipe: r.hasRecipe,
        tracksStock: r.tracksStock,
        canMake: r.canMake,
        unavailable: r.unavailable,
        blockedBy: r.blockedBy,
      }))}
    />
  );
}
