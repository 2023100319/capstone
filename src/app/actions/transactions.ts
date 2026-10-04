"use server";

import prisma from "@/lib/prisma";
import type { PaymentMethod, TransactionStatus, OrderType } from "@prisma/client";
import { requireCan } from "@/lib/guards";
import type { OrderLineItem } from "@/types/order";

/** A transaction row shaped for the Transaction page + PDF receipt. */
export type TransactionRow = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  cashierName: string;
  paymentMethod: PaymentMethod;
  amount: number;
  status: TransactionStatus;
  orderType: OrderType;
  items: OrderLineItem[];
};

/**
 * Paid transactions, newest first. Cashiers see only their own; admin, owner and
 * supervisor see every branch transaction. Role is re-derived from the session.
 */
export async function getTransactions(): Promise<TransactionRow[]> {
  const user = await requireCan("viewTransactions");

  const rows = await prisma.transaction.findMany({
    where: user.role === "CASHIER" ? { cashierId: user.id } : undefined,
    include: { order: true, cashier: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return rows.map((t) => ({
    id: t.id,
    orderNumber: t.order.orderNumber,
    createdAt: t.createdAt,
    cashierName: t.cashier.name,
    paymentMethod: t.paymentMethod,
    amount: t.amount,
    status: t.status,
    orderType: t.order.orderType,
    items: (t.order.items as unknown as OrderLineItem[]) ?? [],
  }));
}

/** One day's worth of paid sales, for the auto-generated daily transaction file. */
export type DailySummary = {
  date: string; // YYYY-MM-DD in PH time
  label: string; // e.g. "July 20, 2026"
  orderCount: number;
  totalSales: number;
};

const PH_TZ = "Asia/Manila";

/** PH-local calendar date (YYYY-MM-DD) for a timestamp. */
function phDate(d: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return d.toLocaleDateString("en-CA", { timeZone: PH_TZ });
}

/**
 * Paid sales grouped by PH-local day, newest first. Powers the "Daily Sales"
 * list — each day is downloadable as an Excel file and "resets" at PH midnight.
 * Store-wide for every viewer (not scoped per cashier).
 */
export async function getDailySummaries(): Promise<DailySummary[]> {
  await requireCan("viewTransactions");

  const rows = await prisma.transaction.findMany({
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const byDay = new Map<string, { orderCount: number; totalSales: number }>();
  for (const t of rows) {
    const key = phDate(t.createdAt);
    const bucket = byDay.get(key) ?? { orderCount: 0, totalSales: 0 };
    bucket.orderCount += 1;
    bucket.totalSales += t.amount;
    byDay.set(key, bucket);
  }

  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, v]) => ({
      date,
      label: new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-US", {
        timeZone: PH_TZ,
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      orderCount: v.orderCount,
      totalSales: v.totalSales,
    }));
}
