import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getReport } from "@/app/actions/reports";
import { monthLabel, parseMonth, parseRange, RANGE_LABELS } from "@/types/reports";
import { currentUser } from "@/lib/guards";
import { can } from "@/lib/roles";

const PH_TZ = "Asia/Manila";

/** Same look as the daily sales file: black band, white bold text. */
const BAND_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A1A" } } as const;
const BAND_FONT = { bold: true, color: { argb: "FFFFFFFF" } } as const;
const MONEY = '#,##0.00';
const THIN = { style: "thin" as const, color: { argb: "FFD9D9D9" } };
const CELL_BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/** Expenses are bought per ingredient, so they can't be split across products. */
const NOT_PER_PRODUCT = "n/a (tracked store-wide)";

export async function GET(request: NextRequest) {
  const actor = await currentUser();
  if (!can(actor?.role, "viewReports")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const range = parseRange(params.get("range") ?? undefined);
  const month = parseMonth(params.get("month") ?? undefined);
  const report = await getReport({
    range,
    month,
    menuItemId: params.get("product") ?? undefined,
  });

  const byProduct = report.productName !== null;
  const periodLabel =
    range === "MONTH" ? monthLabel(report.month) : `Last ${RANGE_LABELS[range].toLowerCase()}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Ericahlicious";
  const ws = wb.addWorksheet("Sales Report");

  const WIDTH = 4;
  [30, 18, 18, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  /** A merged, centred line across the sheet. */
  function banner(text: string, opts: Partial<ExcelJS.Font> = {}, height = 20) {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, WIDTH);
    row.getCell(1).font = { bold: true, size: 12, ...opts };
    row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    row.height = height;
    return row;
  }

  /** A full-width black section heading. */
  function section(title: string) {
    const row = ws.addRow([title]);
    ws.mergeCells(row.number, 1, row.number, WIDTH);
    const cell = row.getCell(1);
    cell.value = title;
    cell.font = BAND_FONT;
    cell.fill = BAND_FILL;
    cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    row.height = 20;
  }

  /** A black column-header row. */
  function columns(headers: string[]) {
    const row = ws.addRow(headers);
    headers.forEach((_, i) => {
      const cell = row.getCell(i + 1);
      cell.font = BAND_FONT;
      cell.fill = BAND_FILL;
      cell.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle" };
      cell.border = CELL_BORDER;
    });
    row.height = 18;
  }

  /** Right-aligned money cells with thousands separators and two decimals. */
  function money(row: ExcelJS.Row, from: number, to: number) {
    for (let i = from; i <= to; i++) {
      const cell = row.getCell(i);
      if (typeof cell.value === "number") cell.numFmt = MONEY;
      cell.alignment = { horizontal: "right" };
      cell.border = CELL_BORDER;
    }
    row.getCell(1).border = CELL_BORDER;
  }

  // ---- Title block --------------------------------------------------------
  banner("ERICAHLICIOUS BREW AND BAKE — SALES REPORT", { size: 14 }, 26);
  banner(`${periodLabel} · ${report.productName ?? "All products"} · paid orders only`);
  banner(
    `Generated: ${new Date().toLocaleString("en-US", {
      timeZone: PH_TZ,
      dateStyle: "long",
      timeStyle: "short",
    })}`,
    { bold: false, size: 10, italic: true, color: { argb: "FF808080" } },
    16
  );
  ws.addRow([]);

  // ---- Summary ------------------------------------------------------------
  section("SUMMARY");
  const summary: [string, number | string][] = [
    ["Total Revenue", report.revenue],
    ["Total Expenses", byProduct ? NOT_PER_PRODUCT : report.expenses],
    ["Net Profit", byProduct ? NOT_PER_PRODUCT : report.profit],
    ["Paid Orders", report.orderCount],
    ["Units Sold", report.unitsSold],
  ];
  for (const [label, value] of summary) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.getCell(1).border = CELL_BORDER;
    const cell = row.getCell(2);
    cell.alignment = { horizontal: "right" };
    cell.border = CELL_BORDER;
    // Counts stay whole; money gets two decimals.
    if (typeof value === "number") {
      cell.numFmt = label === "Paid Orders" || label === "Units Sold" ? "#,##0" : MONEY;
    }
  }
  ws.addRow([]);

  // ---- Breakdown over time ------------------------------------------------
  section(`SALES BREAKDOWN — ${periodLabel.toUpperCase()}`);
  if (report.series.length === 0) {
    ws.addRow(["No paid orders in this period."]).getCell(1).font = { italic: true };
  } else if (byProduct) {
    columns(["Period", "Revenue (PHP)"]);
    for (const point of report.series) money(ws.addRow([point.date, point.revenue]), 2, 2);

    const total = ws.addRow(["TOTAL", report.revenue]);
    total.font = { bold: true };
    money(total, 2, 2);
  } else {
    columns(["Period", "Revenue (PHP)", "Expenses (PHP)", "Net (PHP)"]);
    for (const point of report.series) {
      money(
        ws.addRow([point.date, point.revenue, point.expenses, point.revenue - point.expenses]),
        2,
        4
      );
    }

    const total = ws.addRow(["TOTAL", report.revenue, report.expenses, report.profit]);
    total.font = { bold: true };
    money(total, 2, 4);
  }
  ws.addRow([]);

  // ---- Top items ----------------------------------------------------------
  section(byProduct ? "PRODUCT TOTAL" : "TOP MENU ITEMS");
  if (report.topItems.length === 0) {
    ws.addRow(["No sales in this period."]).getCell(1).font = { italic: true };
  } else {
    columns(["Menu Item", "Revenue (PHP)", "Qty Sold"]);
    for (const item of report.topItems) {
      const row = ws.addRow([item.name, item.revenue, item.orders]);
      money(row, 2, 3);
      row.getCell(3).numFmt = "#,##0";
    }
  }

  if (byProduct) {
    ws.addRow([]);
    const note = ws.addRow([
      "Expenses and net profit are store-wide only — stock is bought per ingredient, so its cost cannot be split across products.",
    ]);
    ws.mergeCells(note.number, 1, note.number, WIDTH);
    note.getCell(1).font = { italic: true, size: 9, color: { argb: "FF808080" } };
    note.getCell(1).alignment = { wrapText: true, vertical: "top" };
    note.height = 28;
  }

  const period = range === "MONTH" ? month : new Date().toISOString().slice(0, 10);
  const filename = `ERICAHLICIOUS_SALES_REPORT_${range}_${period}.xlsx`;

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
