"use server";

import prisma from "@/lib/prisma";

/**
 * The customer-facing menu: available items with their category and recipe.
 * The recipe comes along because it — not the product count — is what decides
 * whether a cooked-to-order item can still be sold.
 */
export async function getMenuItems() {
  return prisma.menuItem.findMany({
    where: { status: "AVAILABLE" },
    include: { category: true, recipe: { include: { inventoryItem: true } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });
}

/**
 * Menu categories, active by default. Pass `archived` to list the archived ones
 * instead — the admin Menu page uses that for its Archived view. Archived
 * categories never reach the customer menu.
 */
export async function getMenuCategories(archived = false) {
  return prisma.menuCategory.findMany({
    where: { archivedAt: archived ? { not: null } : null },
    orderBy: { sortOrder: "asc" },
  });
}
