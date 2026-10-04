"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { OrderStatus, OrderType, PaymentMethod, Prisma } from "@prisma/client";
import { type OrderLineItem } from "@/types/order";
import { requireCan } from "@/lib/guards";
import {
  computeStatus,
  ingredientDraw,
  menuAvailability,
  recipeForVariation,
  type RecipeLine,
} from "@/lib/availability";

function revalidateOrderViews() {
  revalidatePath("/staff/kitchen");
  revalidatePath("/staff/cashier");
  revalidatePath("/staff/cashier/orders");
  revalidatePath("/staff/cashier/payment");
}

/** Screens that show ingredient levels or what's still makeable. */
function revalidateStockViews() {
  revalidatePath("/menu");
  revalidatePath("/");
  revalidatePath("/staff/admin");
  revalidatePath("/staff/admin/menu-health");
  for (const role of ["supervisor", "owner"]) {
    revalidatePath(`/staff/${role}`);
    revalidatePath(`/staff/${role}/inventory`);
    // Menu lives under Supervisor and Owner now, not Admin.
    revalidatePath(`/staff/${role}/menu`);
  }
}

// No 0/O or 1/I — the cashier reads this off the customer's screen and types it
// into the POS, so ambiguous characters would cause mistakes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function randomOrderCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `ORD-${code}`;
}

/** A short random order code, e.g. ORD-NQLJP7, guaranteed unused. */
async function nextOrderNumber() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomOrderCode();
    const taken = await prisma.order.findUnique({
      where: { orderNumber: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error("Could not generate a unique order number");
}

/** What the browser is allowed to send. Prices are NOT taken from the client. */
export type CartSubmission = {
  menuItemId: string;
  qty: number;
  orderType: OrderType;
  variation?: string;
  specialInstructions?: string;
};

export async function createOrder(cart: CartSubmission[], tableNumber?: string) {
  if (cart.length === 0) {
    return { success: false as const, error: "Your cart is empty." };
  }
  if (cart.some((i) => !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 99)) {
    return { success: false as const, error: "Invalid quantity." };
  }

  try {
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: cart.map((i) => i.menuItemId) }, status: "AVAILABLE" },
      include: { category: true, recipe: { include: { inventoryItem: true } } },
    });

    // Re-derive every price from the database. A crafted request must not be
    // able to buy a ₱315 pasta for ₱1.
    const items: OrderLineItem[] = [];
    for (const line of cart) {
      const menuItem = menuItems.find((m) => m.id === line.menuItemId);
      if (!menuItem) {
        return { success: false as const, error: "An item in your cart is no longer available." };
      }

      const variations = (menuItem.variations as { label: string; price: number }[] | null) ?? [];
      const chosen = line.variation
        ? variations.find((v) => v.label === line.variation)
        : undefined;
      if (line.variation && !chosen) {
        return { success: false as const, error: "That option is no longer available." };
      }

      items.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        categoryName: menuItem.category.name,
        price: chosen ? chosen.price : menuItem.price,
        qty: line.qty,
        orderType: line.orderType,
        variation: chosen?.label,
        specialInstructions: line.specialInstructions?.slice(0, 300),
        imageUrl: menuItem.imageUrl ?? undefined,
      });
    }

    // Stock guard — reject anything the store can't actually produce. Two kinds
    // of limit: a recipe-based item is capped by its ingredients, a counted one
    // by its own number on hand. An item with neither has nothing to run out.
    // Recipe items aggregate per (item, variation) because each variation
    // deducts its own ingredient set; counted items are one pool per item, so
    // they are checked once against everything sold in any variation.
    const qtyByItem = new Map<string, number>();
    const qtyByItemVariation = new Map<string, number>();
    for (const it of items) {
      qtyByItem.set(it.menuItemId, (qtyByItem.get(it.menuItemId) ?? 0) + it.qty);
      const key = `${it.menuItemId}\u0000${it.variation ?? ""}`;
      qtyByItemVariation.set(key, (qtyByItemVariation.get(key) ?? 0) + it.qty);
    }

    for (const [menuItemId, itemQty] of qtyByItem) {
      const mi = menuItems.find((m) => m.id === menuItemId);
      if (!mi || mi.stockMode !== "DIRECT") continue;
      if (mi.stockQuantity <= 0) {
        return { success: false as const, error: `${mi.name} is sold out.` };
      }
      if (mi.stockQuantity < itemQty) {
        return {
          success: false as const,
          error: `Only ${mi.stockQuantity} ${mi.unitLabel} of ${mi.name} left.`,
        };
      }
    }

    const recipeDraw: { recipe: RecipeLine[]; qty: number }[] = [];
    for (const [key, qty] of qtyByItemVariation) {
      const [menuItemId, variation = ""] = key.split("\u0000");
      const mi = menuItems.find((m) => m.id === menuItemId);
      if (!mi || mi.stockMode === "DIRECT") continue;

      const availability = menuAvailability(mi);
      if (!availability.hasRecipe) continue;

      if (variation !== "") {
        // This specific variation must be producible on its own — a makeable
        // 16oz says nothing about a 22oz whose ingredients ran out.
        const chosen = availability.variations?.find((v) => v.label === variation);
        if (!chosen) {
          return {
            success: false as const,
            error: `${mi.name} (${variation}) has no ingredients set up yet.`,
          };
        }
        if (chosen.canMake <= 0) {
          return {
            success: false as const,
            error: `${mi.name} (${variation}) is unavailable — out of ${chosen.blockedBy.join(", ")}.`,
          };
        }
        if (chosen.canMake < qty) {
          return {
            success: false as const,
            error: `Only ${chosen.canMake} left of ${mi.name} (${variation}).`,
          };
        }
        recipeDraw.push({
          recipe: recipeForVariation(mi.recipe, variation),
          qty,
        });
      } else {
        if (availability.unavailable) {
          return {
            success: false as const,
            error: `${mi.name} is unavailable — out of ${availability.blockedBy.join(", ")}.`,
          };
        }
        recipeDraw.push({ recipe: recipeForVariation(mi.recipe, ""), qty });
      }
    }

    // Ingredients are shared between products, so the whole cart is checked at
    // once — two lattes and a frappe can drain the same milk.
    const ingredients = new Map(
      menuItems.flatMap((m) => m.recipe.map((line) => [line.inventoryItem.id, line.inventoryItem]))
    );
    for (const [inventoryItemId, needed] of ingredientDraw(recipeDraw)) {
      const ingredient = ingredients.get(inventoryItemId);
      if (ingredient && ingredient.stockQuantity < needed) {
        return {
          success: false as const,
          error: `Not enough ${ingredient.ingredientName} left for that many servings.`,
        };
      }
    }

    const totalAmount = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    // The order is Dine In only if every line item is; otherwise treat it as Take Out.
    const orderType = items.every((i) => i.orderType === "DINE_IN") ? "DINE_IN" : "TAKE_OUT";

    const order = await prisma.order.create({
      data: {
        orderNumber: await nextOrderNumber(),
        tableNumber: tableNumber ?? null,
        orderType,
        items: items as unknown as Prisma.InputJsonValue,
        totalAmount,
      },
    });

    revalidateOrderViews();
    return { success: true as const, orderNumber: order.orderNumber };
  } catch {
    return { success: false as const, error: "Failed to place your order. Please try again." };
  }
}

export async function getOrderByNumber(orderNumber: string) {
  return prisma.order.findUnique({
    where: { orderNumber },
    include: { transaction: true },
  });
}

/**
 * True while a placed order is still unpaid and un-cancelled, so the cart may
 * point the customer back at it instead of booking a duplicate.
 *
 * The cart keeps its contents after ordering and remembers the order number it
 * produced. That memo can outlive the order — paid at the counter, or cancelled
 * — so it is checked here rather than expired on a guessed timer. Anything that
 * is no longer PENDING falls through and a fresh order gets created.
 */
export async function isOrderReusable(orderNumber: string) {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { status: true, paidAt: true },
  });
  return !!order && order.status === "PENDING" && order.paidAt === null;
}

/** Every active order with all of its line items — one combined prep queue. */
export async function getActiveOrders() {
  const orders = await prisma.order.findMany({
    where: { status: { in: ["PENDING", "PREPARING", "READY"] } },
    orderBy: { createdAt: "asc" },
  });

  return orders
    .map((order) => {
      const items = (order.items as unknown as OrderLineItem[]) ?? [];
      return {
        id: order.id,
        code: order.orderNumber,
        orderType: order.orderType === "DINE_IN" ? "Dine In" : "Take Out",
        status: order.status as "PENDING" | "PREPARING" | "READY",
        items: items.map((i) => ({ name: i.name, qty: i.qty })),
      };
    })
    .filter((order) => order.items.length > 0);
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  try {
    await requireCan("advanceOrders");
    await prisma.order.update({ where: { id: orderId }, data: { status } });
    revalidateOrderViews();
    return { success: true as const };
  } catch {
    return { success: false as const, error: "Failed to update order status." };
  }
}

export async function getOrders() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { transaction: true },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    tableNumber: order.tableNumber,
    orderType: order.orderType,
    status: order.status,
    totalAmount: order.totalAmount,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
    items: (order.items as unknown as OrderLineItem[]) ?? [],
  }));
}

/** Orders that have been placed but not yet paid at the counter. */
export async function getUnpaidOrders() {
  const orders = await prisma.order.findMany({
    where: { paidAt: null, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "asc" },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    orderType: order.orderType,
    status: order.status,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    items: (order.items as unknown as OrderLineItem[]) ?? [],
  }));
}

export async function payOrder(orderId: string, paymentMethod: PaymentMethod) {
  try {
    // The cashier is taken from the session — never from the client, which
    // could otherwise credit the payment to any user id it liked.
    const cashier = await requireCan("manageOrders");

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return { success: false as const, error: "Order not found." };
    if (order.paidAt) return { success: false as const, error: "Order is already paid." };

    // Total ordered servings per product — the basis for every deduction below.
    // Recipe items aggregate per (item, variation), since each variation draws
    // from its own ingredient set; counted items stay per item, one pool.
    const lines = (order.items as unknown as OrderLineItem[]) ?? [];
    const qtyByItem = new Map<string, number>();
    const qtyByItemVariation = new Map<string, number>();
    for (const l of lines) {
      if (!l.menuItemId) continue;
      qtyByItem.set(l.menuItemId, (qtyByItem.get(l.menuItemId) ?? 0) + l.qty);
      const key = `${l.menuItemId}\u0000${l.variation ?? ""}`;
      qtyByItemVariation.set(key, (qtyByItemVariation.get(key) ?? 0) + l.qty);
    }

    // Read everything the deduction needs BEFORE opening the transaction. The
    // database is remote, so a query-per-round-trip inside an interactive
    // transaction blows past its 5s timeout on a normal multi-item order.
    const ordered =
      qtyByItem.size > 0
        ? await prisma.menuItem.findMany({
            where: { id: { in: [...qtyByItem.keys()] } },
            include: { recipe: { include: { inventoryItem: true } } },
          })
        : [];

    const writes: Prisma.PrismaPromise<unknown>[] = [
      prisma.transaction.create({
        data: {
          orderId: order.id,
          cashierId: cashier.id,
          paymentMethod,
          amount: order.totalAmount,
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { paidAt: new Date() },
      }),
    ];

    // Paying burns whichever stock gates the item — its ingredients, or its own
    // count. Never both: a DIRECT item carries no recipe, so the two can never
    // disagree about the same product.
    const recipeDraw: { recipe: RecipeLine[]; qty: number }[] = [];
    const ingredients = new Map<string, { stockQuantity: number; reorderLevel: number }>();

    for (const menuItem of ordered) {
      if (menuItem.stockMode === "DIRECT") {
        const sold = qtyByItem.get(menuItem.id) ?? 0;
        if (sold <= 0) continue;
        writes.push(
          prisma.menuItem.update({
            where: { id: menuItem.id },
            data: { stockQuantity: Math.max(0, menuItem.stockQuantity - sold) },
          })
        );
        continue;
      }

      for (const [key, qty] of qtyByItemVariation) {
        const [menuItemId, variation = ""] = key.split("\u0000");
        if (menuItemId !== menuItem.id) continue;

        const linesForVariation = recipeForVariation(menuItem.recipe, variation);
        if (linesForVariation.length === 0) continue;

        recipeDraw.push({ recipe: linesForVariation, qty });
        for (const line of linesForVariation) {
          ingredients.set(line.inventoryItem.id, line.inventoryItem);
        }
      }
    }

    for (const [inventoryItemId, needed] of ingredientDraw(recipeDraw)) {
      const ingredient = ingredients.get(inventoryItemId);
      if (!ingredient) continue;
      const next = Math.max(0, ingredient.stockQuantity - needed);
      writes.push(
        prisma.inventoryItem.update({
          where: { id: inventoryItemId },
          // Same rule as every other stock write, so LOW / OUT_OF_STOCK trips
          // the moment a sale drains an ingredient past its reorder level.
          data: { stockQuantity: next, status: computeStatus(next, ingredient.reorderLevel) },
        })
      );
    }

    // One batched transaction — every write commits together, in a single trip.
    await prisma.$transaction(writes);

    revalidateOrderViews();
    // Reflect the new ingredient / sold-out state everywhere it shows.
    revalidateStockViews();
    return { success: true as const };
  } catch (e) {
    // The cashier only ever sees the friendly line, but a swallowed payment
    // failure is impossible to diagnose without this.
    console.error("payOrder failed:", e);
    return { success: false as const, error: "Failed to record the payment." };
  }
}

export async function getCashierStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: startOfDay }, status: { not: "CANCELLED" } },
    select: { totalAmount: true, paidAt: true },
  });

  const paid = orders.filter((o) => o.paidAt !== null);
  const revenue = paid.reduce((sum, o) => sum + o.totalAmount, 0);

  return {
    revenue,
    totalOrders: orders.length,
    paidOrders: paid.length,
    avgOrderValue: paid.length > 0 ? Math.round(revenue / paid.length) : 0,
  };
}

/** Recent orders for the cashier dashboard list. */
export async function getRecentOrders() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return orders.map((order) => {
    const items = (order.items as unknown as OrderLineItem[]) ?? [];
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      itemCount: items.reduce((sum, i) => sum + i.qty, 0),
      status: order.status,
      totalAmount: order.totalAmount,
      isPaid: order.paidAt !== null,
    };
  });
}
