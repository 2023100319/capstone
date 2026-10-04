import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { currentUser } from "@/lib/guards";
import { can } from "@/lib/roles";
import type { OrderLineItem } from "@/types/order";

const PH_TZ = "Asia/Manila";

function phField(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleString("en-US", { timeZone: PH_TZ, ...opts });
}

/**
 * Auto-generated daily sales transaction file (.xlsx) for one PH-local day.
 * Every paid transaction that day → one row per line item, matching the client's
 * POS_DAILY_TRANSACTION sample. Self-guards (this path is outside the proxy matcher).
 */
export async function GET(request: NextRequest) {
  const actor = await currentUser();
  if (!can(actor?.role, "viewTransactions")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new NextResponse("Invalid date", { status: 400 });
  }

  // PH-local day window [00:00, next 00:00) expressed in UTC.
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const transactions = await prisma.transaction.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { order: true },
    orderBy: { createdAt: "asc" },
  });

  const label = new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-US", {
    timeZone: PH_TZ,
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Ericahlicious";
  const ws = wb.addWorksheet(`Daily_Transactions_${date}`);

  const HEADERS = [
    "Transaction ID", "Date", "Time", "OR No.", "Menu Item",
    "Category", "Qty", "Unit Price (₱)", "Total (₱)",
  ];
  const widths = [16, 12, 11, 12, 26, 16, 8, 15, 14];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  // Title + date banner
  ws.mergeCells(1, 1, 1, HEADERS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "ERICAHLICIOUS BREW AND BAKE - DAILY SALES TRANSACTION";
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, HEADERS.length);
  const dateCell = ws.getCell(2, 1);
  dateCell.value = `Date: ${label}`;
  dateCell.font = { bold: true, size: 12 };
  dateCell.alignment = { horizontal: "center" };
  ws.getRow(2).height = 20;

  // Header row (row 3) — black fill, white bold
  const headerRow = ws.getRow(3);
  HEADERS.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A1A" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  headerRow.height = 20;

  // Data rows — one per line item
  let seq = 0;
  let totalQty = 0;
  let totalAmount = 0;
  for (const t of transactions) {
    seq += 1;
    const txnId = `TXN-${String(seq).padStart(4, "0")}`;
    const items = (t.order.items as unknown as OrderLineItem[]) ?? [];
    for (const line of items) {
      const lineTotal = line.price * line.qty;
      totalQty += line.qty;
      totalAmount += lineTotal;
      const row = ws.addRow([
        txnId,
        phField(t.createdAt, { month: "numeric", day: "numeric", year: "numeric" }),
        phField(t.createdAt, { hour: "numeric", minute: "2-digit", hour12: true }),
        t.order.orderNumber,
        line.variation ? `${line.name} (${line.variation})` : line.name,
        line.categoryName,
        line.qty,
        line.price,
        lineTotal,
      ]);
      row.getCell(8).numFmt = "#,##0.00";
      row.getCell(9).numFmt = "#,##0.00";
      row.getCell(7).alignment = { horizontal: "center" };
    }
  }

  // TOTAL row
  const totalRow = ws.addRow(["", "", "", "", "", "TOTAL", totalQty, "", totalAmount]);
  totalRow.getCell(6).font = { bold: true };
  totalRow.getCell(7).font = { bold: true };
  totalRow.getCell(7).alignment = { horizontal: "center" };
  totalRow.getCell(9).font = { bold: true };
  totalRow.getCell(9).numFmt = "#,##0.00";

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="POS_DAILY_TRANSACTION_${date}.xlsx"`,
    },
  });
}
