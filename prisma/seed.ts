import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createAdapter } from "../src/lib/db-adapter";

const prisma = new PrismaClient({ adapter: createAdapter() });

const STAFF = [
  { employeeId: "EMP-0001", name: "Juan Cruz", username: "cashier", role: "CASHIER" },
  { employeeId: "EMP-0002", name: "Samantha Santos", username: "supervisor", role: "SUPERVISOR" },
  { employeeId: "EMP-0003", name: "Ana Reyes", username: "admin", role: "ADMIN" },
  { employeeId: "EMP-0004", name: "Ericah Rivera Calayag", username: "owner", role: "OWNER" },
  { employeeId: "EMP-0005", name: "Mark Villanueva", username: "kitchen", role: "KITCHEN" },
] as const;

const MENU_CATEGORIES: { name: string; sortOrder: number }[] = [
  { name: "Pasta", sortOrder: 1 },
  { name: "Rice Meals", sortOrder: 2 },
  { name: "Pica-Pica / Snacks", sortOrder: 3 },
  { name: "Cakes", sortOrder: 4 },
  { name: "Coffee / Iced Drinks", sortOrder: 5 },
  { name: "Sweet Drinks", sortOrder: 6 },
];

/** Which prep area stocks each inventory category — the Bar/Kitchen split. */
const INVENTORY_CATEGORIES: { name: string; station: "BAR" | "KITCHEN" }[] = [
  { name: "Pasta", station: "KITCHEN" },
  { name: "Dairy", station: "KITCHEN" },
  { name: "Syrups", station: "BAR" },
  { name: "Powders", station: "KITCHEN" },
  { name: "Baking", station: "KITCHEN" },
  { name: "Sweeteners", station: "BAR" },
  { name: "Meat", station: "KITCHEN" },
  { name: "Produce", station: "KITCHEN" },
  { name: "Coffee", station: "BAR" },
  { name: "Frozen & Snacks", station: "KITCHEN" },
  { name: "Grains", station: "KITCHEN" },
  { name: "Condiments", station: "KITCHEN" },
];

type SeedMenuItem = {
  name: string;
  description: string;
  category: string;
  price: number;
  originalPrice?: number;
  isPromo: boolean;
  isRecommended?: boolean;
  imageUrl: string;
  ingredients: readonly string[];
  hasVariation: boolean;
  variations?: readonly { label: string; price: number }[];
};

const MENU_ITEMS: readonly SeedMenuItem[] = [
  {
    name: "Chicken Alfredo Pasta",
    description: "Pasta with Alfredo sauce and tender chicken.",
    category: "Pasta",
    price: 315,
    isPromo: false,
    isRecommended: true,
    imageUrl: "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=600&q=80",
    ingredients: ["Pasta (100g)", "Chicken breast (150g)", "Garlic (10g)", "Milk (80ml)", "Cheese (50g)", "Butter (20g)", "All-purpose cream (150ml)"],
    hasVariation: false,
  },
  {
    name: "Filipino Breakfast Danggit",
    description: "Danggit with garlic rice and egg.",
    category: "Rice Meals",
    price: 320,
    isPromo: true,
    imageUrl: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&q=80",
    ingredients: ["Danggit (120g)", "Egg (1 piece)", "Rice (200g)", "Garlic (10g)", "Cooking oil (15ml)", "Butter (10g)"],
    hasVariation: false,
  },
  {
    name: "Flavored Americano",
    description: "A variety of flavored Americano options.",
    category: "Coffee / Iced Drinks",
    price: 175,
    originalPrice: 185,
    isPromo: true,
    isRecommended: true,
    imageUrl: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&q=80",
    ingredients: ["Espresso (60ml)", "Water (150ml)", "Flavored syrup (20ml)"],
    hasVariation: true,
    variations: [
      { label: "22oz", price: 175 },
      { label: "16oz", price: 145 },
    ],
  },
  {
    name: "Cheesy Bacon Fries",
    description: "Crispy fries topped with cheese sauce and bacon bits.",
    category: "Pica-Pica / Snacks",
    price: 165,
    isPromo: false,
    imageUrl: "https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&q=80",
    ingredients: ["Potato fries (200g)", "Cheese sauce (60ml)", "Bacon bits (30g)"],
    hasVariation: false,
  },
  {
    name: "Red Velvet Cake",
    description: "Classic moist red velvet with cream cheese frosting.",
    category: "Cakes",
    price: 220,
    isPromo: false,
    imageUrl: "https://images.unsplash.com/photo-1586788224331-947f68671cf1?w=600&q=80",
    ingredients: ["All-purpose flour (120g)", "Cocoa powder (15g)", "Cream cheese (80g)", "Sugar (100g)"],
    hasVariation: false,
  },
  {
    name: "Spanish Latte",
    description: "Espresso with steamed milk and a touch of sweetness.",
    category: "Coffee / Iced Drinks",
    price: 160,
    isPromo: false,
    isRecommended: true,
    imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&q=80",
    ingredients: ["Espresso (60ml)", "Fresh milk (180ml)", "Condensed milk (20ml)"],
    hasVariation: true,
    variations: [
      { label: "22oz", price: 160 },
      { label: "16oz", price: 135 },
    ],
  },
  {
    name: "Chocolate Java Chip Frappe",
    description: "Blended chocolate frappe with java chips.",
    category: "Coffee / Iced Drinks",
    price: 210,
    isPromo: false,
    imageUrl: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600&q=80",
    ingredients: ["Chocolate powder (30g)", "Fresh milk (200ml)", "Java chips (20g)", "Ice (150g)"],
    hasVariation: false,
  },
  {
    name: "Sans Rival",
    description: "A Filipino classic meringue cake.",
    category: "Sweet Drinks",
    price: 195,
    isPromo: false,
    imageUrl: "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600&q=80",
    ingredients: ["Cashew (60g)", "Butter (50g)", "Egg white (3 pieces)", "Sugar (80g)"],
    hasVariation: false,
  },
];

/**
 * Generic pantry list. The client can't share their real recipes, so these are
 * ordinary café ingredients with plausible quantities — enough for the system to
 * deduct against and to demonstrate shortage detection. Supervisors can edit
 * every number in the app.
 *
 * Units are picked so recipe quantities read naturally: g/ml/pcs for anything
 * used by the spoonful, kg/L only for genuine bulk. There is no unit conversion,
 * so a recipe always states its amount in the unit chosen here.
 */
const INVENTORY: {
  ingredientName: string;
  category: string;
  stockQuantity: number;
  unit: string;
  reorderLevel: number;
  supplier: string;
  expiryDate: string;
}[] = [
  { ingredientName: "Fresh Milk", category: "Dairy", stockQuantity: 8000, unit: "ml", reorderLevel: 2000, supplier: "Farm Fresh Dairy", expiryDate: "2027-03-24" },
  { ingredientName: "Eggs", category: "Dairy", stockQuantity: 12, unit: "pcs", reorderLevel: 24, supplier: "Farm Fresh Dairy", expiryDate: "2027-03-24" },
  { ingredientName: "Spaghetti / Pasta Noodles", category: "Pasta", stockQuantity: 10, unit: "kg", reorderLevel: 3, supplier: "Bean Masters PH", expiryDate: "2027-03-24" },
  { ingredientName: "Matcha Powder", category: "Powders", stockQuantity: 2, unit: "kg", reorderLevel: 2, supplier: "Green Tea PH", expiryDate: "2026-12-31" },
  { ingredientName: "Chocolate Powder", category: "Powders", stockQuantity: 0, unit: "kg", reorderLevel: 2, supplier: "Bean Masters PH", expiryDate: "2026-11-30" },
  { ingredientName: "All-Purpose Flour", category: "Baking", stockQuantity: 5, unit: "kg", reorderLevel: 2, supplier: "Bakers Hub", expiryDate: "2026-06-30" },
  { ingredientName: "Caramel Syrup", category: "Syrups", stockQuantity: 3, unit: "L", reorderLevel: 1, supplier: "Sweet Supply Co.", expiryDate: "2027-01-15" },
  { ingredientName: "White Sugar", category: "Sweeteners", stockQuantity: 15, unit: "kg", reorderLevel: 5, supplier: "Sweet Supply Co.", expiryDate: "2027-08-01" },
  { ingredientName: "Chicken Breast", category: "Meat", stockQuantity: 4, unit: "kg", reorderLevel: 5, supplier: "Meat Masters PH", expiryDate: "2026-07-20" },

  // Coffee bar
  { ingredientName: "Espresso Beans", category: "Coffee", stockQuantity: 4000, unit: "g", reorderLevel: 1000, supplier: "Bean Masters PH", expiryDate: "2027-02-28" },
  { ingredientName: "Drinking Water", category: "Coffee", stockQuantity: 40, unit: "L", reorderLevel: 10, supplier: "AquaPure Refilling", expiryDate: "2027-06-30" },
  { ingredientName: "Flavored Syrup", category: "Syrups", stockQuantity: 4, unit: "L", reorderLevel: 1, supplier: "Sweet Supply Co.", expiryDate: "2027-04-30" },
  { ingredientName: "Condensed Milk", category: "Dairy", stockQuantity: 3000, unit: "ml", reorderLevel: 1000, supplier: "Farm Fresh Dairy", expiryDate: "2027-05-31" },
  { ingredientName: "Java Chips", category: "Frozen & Snacks", stockQuantity: 1500, unit: "g", reorderLevel: 500, supplier: "Sweet Supply Co.", expiryDate: "2027-01-31" },
  { ingredientName: "Ice", category: "Frozen & Snacks", stockQuantity: 20000, unit: "g", reorderLevel: 5000, supplier: "Malolos Ice Plant", expiryDate: "2026-12-31" },

  // Kitchen
  { ingredientName: "Garlic", category: "Produce", stockQuantity: 2000, unit: "g", reorderLevel: 500, supplier: "Bulacan Fresh Market", expiryDate: "2026-09-30" },
  { ingredientName: "Butter", category: "Dairy", stockQuantity: 2500, unit: "g", reorderLevel: 800, supplier: "Farm Fresh Dairy", expiryDate: "2026-11-30" },
  { ingredientName: "Cheese", category: "Dairy", stockQuantity: 2000, unit: "g", reorderLevel: 700, supplier: "Farm Fresh Dairy", expiryDate: "2026-10-31" },
  { ingredientName: "All-Purpose Cream", category: "Dairy", stockQuantity: 4000, unit: "ml", reorderLevel: 1000, supplier: "Farm Fresh Dairy", expiryDate: "2026-12-15" },
  { ingredientName: "Cream Cheese", category: "Dairy", stockQuantity: 1600, unit: "g", reorderLevel: 500, supplier: "Farm Fresh Dairy", expiryDate: "2026-10-15" },
  { ingredientName: "Rice", category: "Grains", stockQuantity: 25, unit: "kg", reorderLevel: 8, supplier: "Bulacan Grains Trading", expiryDate: "2027-07-31" },
  { ingredientName: "Cooking Oil", category: "Condiments", stockQuantity: 8, unit: "L", reorderLevel: 2, supplier: "Bulacan Grains Trading", expiryDate: "2027-03-31" },
  { ingredientName: "Danggit", category: "Meat", stockQuantity: 3000, unit: "g", reorderLevel: 1000, supplier: "Meat Masters PH", expiryDate: "2026-10-31" },
  { ingredientName: "Potato Fries", category: "Frozen & Snacks", stockQuantity: 6000, unit: "g", reorderLevel: 2000, supplier: "Frozen Goods PH", expiryDate: "2027-02-28" },
  { ingredientName: "Cheese Sauce", category: "Condiments", stockQuantity: 2500, unit: "ml", reorderLevel: 800, supplier: "Sweet Supply Co.", expiryDate: "2026-12-31" },
  { ingredientName: "Bacon Bits", category: "Meat", stockQuantity: 1200, unit: "g", reorderLevel: 400, supplier: "Meat Masters PH", expiryDate: "2026-11-15" },
  { ingredientName: "Cocoa Powder", category: "Powders", stockQuantity: 1500, unit: "g", reorderLevel: 500, supplier: "Bakers Hub", expiryDate: "2027-01-31" },
  { ingredientName: "Cashew", category: "Frozen & Snacks", stockQuantity: 1800, unit: "g", reorderLevel: 600, supplier: "Bakers Hub", expiryDate: "2027-03-31" },
];

/**
 * Generic recipes — quantity per single serving, in each ingredient's own unit.
 * Every sellable item needs one: ingredients are the only stock the app tracks,
 * so an item without a recipe is simply one nothing can warn about.
 */
  /** Which variation a line feeds — "" / absent on items with no variations. */
  const RECIPES: Record<
    string,
    { ingredient: string; quantity: number; variation?: string }[]
  > = {
  "Chicken Alfredo Pasta": [
    { ingredient: "Spaghetti / Pasta Noodles", quantity: 0.1 },
    { ingredient: "Chicken Breast", quantity: 0.15 },
    { ingredient: "Garlic", quantity: 10 },
    { ingredient: "Fresh Milk", quantity: 80 },
    { ingredient: "Cheese", quantity: 50 },
    { ingredient: "Butter", quantity: 20 },
    { ingredient: "All-Purpose Cream", quantity: 150 },
  ],
  "Filipino Breakfast Danggit": [
    { ingredient: "Danggit", quantity: 120 },
    { ingredient: "Eggs", quantity: 1 },
    { ingredient: "Rice", quantity: 0.2 },
    { ingredient: "Garlic", quantity: 10 },
    { ingredient: "Cooking Oil", quantity: 0.015 },
    { ingredient: "Butter", quantity: 10 },
  ],
  "Flavored Americano": [
    // The 16oz is the smaller serving; the 22oz scales everything up.
    { ingredient: "Espresso Beans", quantity: 18, variation: "16oz" },
    { ingredient: "Drinking Water", quantity: 0.15, variation: "16oz" },
    { ingredient: "Flavored Syrup", quantity: 0.02, variation: "16oz" },
    { ingredient: "Ice", quantity: 120, variation: "16oz" },
    { ingredient: "Espresso Beans", quantity: 22, variation: "22oz" },
    { ingredient: "Drinking Water", quantity: 0.18, variation: "22oz" },
    { ingredient: "Flavored Syrup", quantity: 0.03, variation: "22oz" },
    { ingredient: "Ice", quantity: 180, variation: "22oz" },
  ],
  "Cheesy Bacon Fries": [
    { ingredient: "Potato Fries", quantity: 200 },
    { ingredient: "Cheese Sauce", quantity: 60 },
    { ingredient: "Bacon Bits", quantity: 30 },
    { ingredient: "Cooking Oil", quantity: 0.03 },
  ],
  "Spanish Latte": [
    { ingredient: "Espresso Beans", quantity: 18, variation: "16oz" },
    { ingredient: "Fresh Milk", quantity: 180, variation: "16oz" },
    { ingredient: "Condensed Milk", quantity: 20, variation: "16oz" },
    { ingredient: "Espresso Beans", quantity: 22, variation: "22oz" },
    { ingredient: "Fresh Milk", quantity: 220, variation: "22oz" },
    { ingredient: "Condensed Milk", quantity: 25, variation: "22oz" },
  ],
  "Chocolate Java Chip Frappe": [
    { ingredient: "Chocolate Powder", quantity: 0.03 },
    { ingredient: "Fresh Milk", quantity: 200 },
    { ingredient: "Java Chips", quantity: 20 },
    { ingredient: "Ice", quantity: 150 },
  ],
  "Red Velvet Cake": [
    { ingredient: "All-Purpose Flour", quantity: 0.12 },
    { ingredient: "Cocoa Powder", quantity: 15 },
    { ingredient: "Cream Cheese", quantity: 80 },
    { ingredient: "White Sugar", quantity: 0.1 },
  ],
  "Sans Rival": [
    { ingredient: "Cashew", quantity: 60 },
    { ingredient: "Butter", quantity: 50 },
    { ingredient: "Eggs", quantity: 3 },
    { ingredient: "White Sugar", quantity: 0.08 },
  ],
};

/** Same rule the app uses whenever stock changes. */
function statusFor(stockQuantity: number, reorderLevel: number) {
  if (stockQuantity <= 0) return "OUT_OF_STOCK" as const;
  if (stockQuantity <= reorderLevel) return "LOW" as const;
  return "GOOD" as const;
}

async function main() {
  console.log("Seeding staff accounts...");
  const passwordHash = await bcrypt.hash("password123", 10);
  for (const staff of STAFF) {
    await prisma.user.upsert({
      where: { username: staff.username },
      update: { name: staff.name, role: staff.role, employeeId: staff.employeeId },
      create: {
        name: staff.name,
        employeeId: staff.employeeId,
        username: staff.username,
        password: passwordHash,
        role: staff.role,
      },
    });
  }

  console.log("Seeding menu categories...");
  for (const cat of MENU_CATEGORIES) {
    await prisma.menuCategory.upsert({
      where: { name: cat.name },
      update: { sortOrder: cat.sortOrder },
      create: cat,
    });
  }

  console.log("Seeding inventory categories...");
  for (const cat of INVENTORY_CATEGORIES) {
    await prisma.inventoryCategory.upsert({
      where: { name: cat.name },
      update: { station: cat.station },
      create: cat,
    });
  }

  console.log("Seeding menu items...");
  for (const item of MENU_ITEMS) {
    const category = await prisma.menuCategory.findUniqueOrThrow({
      where: { name: item.category },
    });
    const data = {
      name: item.name,
      description: item.description,
      categoryId: category.id,
      price: item.price,
      originalPrice: item.originalPrice ?? null,
      isPromo: item.isPromo,
      isRecommended: item.isRecommended ?? false,
      imageUrl: item.imageUrl,
      ingredients: [...item.ingredients],
      hasVariation: item.hasVariation,
      variations: item.variations ? item.variations.map((v) => ({ ...v })) : undefined,
    };
    const existing = await prisma.menuItem.findFirst({ where: { name: item.name } });
    if (existing) {
      await prisma.menuItem.update({ where: { id: existing.id }, data });
    } else {
      await prisma.menuItem.create({ data });
    }
  }

  console.log("Seeding inventory...");
  const supervisor = await prisma.user.findUnique({ where: { username: "supervisor" } });
  for (const item of INVENTORY) {
    const category = await prisma.inventoryCategory.findUniqueOrThrow({
      where: { name: item.category },
    });
    const data = {
      ingredientName: item.ingredientName,
      categoryId: category.id,
      stockQuantity: item.stockQuantity,
      unit: item.unit,
      reorderLevel: item.reorderLevel,
      supplier: item.supplier,
      expiryDate: new Date(item.expiryDate),
      status: statusFor(item.stockQuantity, item.reorderLevel),
      updatedById: supervisor?.id ?? null,
    };
    const existing = await prisma.inventoryItem.findFirst({
      where: { ingredientName: item.ingredientName },
    });
    if (existing) {
      await prisma.inventoryItem.update({ where: { id: existing.id }, data });
    } else {
      await prisma.inventoryItem.create({ data });
    }
  }

  console.log("Seeding recipes...");
  for (const [menuItemName, lines] of Object.entries(RECIPES)) {
    const menuItem = await prisma.menuItem.findFirst({ where: { name: menuItemName } });
    if (!menuItem) {
      console.warn(`  skipped ${menuItemName} — no such menu item`);
      continue;
    }

    // A variation item's recipe is one ingredient set per variation — a stale
    // flat set ("" label) from an older seed would sit there deducting nothing,
    // so it goes before the per-variation lines go in.
    if (menuItem.hasVariation) {
      await prisma.recipeItem.deleteMany({
        where: { menuItemId: menuItem.id, variationLabel: "" },
      });
    }

    for (const line of lines) {
      if (menuItem.hasVariation && !line.variation) {
        console.warn(`  skipped ${menuItemName} → ${line.ingredient} — no variation named`);
        continue;
      }
      const ingredient = await prisma.inventoryItem.findFirst({
        where: { ingredientName: line.ingredient },
      });
      if (!ingredient) {
        console.warn(`  skipped ${menuItemName} → ${line.ingredient} — no such ingredient`);
        continue;
      }

      const variationLabel = line.variation ?? "";
      await prisma.recipeItem.upsert({
        where: {
          menuItemId_variationLabel_inventoryItemId: {
            menuItemId: menuItem.id,
            variationLabel,
            inventoryItemId: ingredient.id,
          },
        },
        update: { quantity: line.quantity },
        create: {
          menuItemId: menuItem.id,
          inventoryItemId: ingredient.id,
          quantity: line.quantity,
          variationLabel,
        },
      });
    }
  }

  const [users, menuCats, menu, invCats, inventory, recipes] = await Promise.all([
    prisma.user.count(),
    prisma.menuCategory.count(),
    prisma.menuItem.count(),
    prisma.inventoryCategory.count(),
    prisma.inventoryItem.count(),
    prisma.recipeItem.count(),
  ]);
  console.log(
    `Done. Users: ${users}, Menu categories: ${menuCats}, Menu items: ${menu}, ` +
      `Inventory categories: ${invCats}, Inventory items: ${inventory}, Recipe lines: ${recipes}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
