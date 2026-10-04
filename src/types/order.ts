import type { OrderType } from "@prisma/client";

/** One line item as stored in the `Order.items` JSON column. */
export type OrderLineItem = {
  menuItemId: string;
  name: string;
  categoryName: string;
  price: number;
  qty: number;
  orderType: OrderType;
  variation?: string;
  specialInstructions?: string;
  imageUrl?: string;
};
