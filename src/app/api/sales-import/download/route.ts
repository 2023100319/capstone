import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { requireCan } from "@/lib/guards";
import { parseImportDetails } from "@/lib/import-details";
import { SALES_COL, writeSalesSheetHeader, writeTotalRow } from "@/lib/sales-sheet";

// Re-downloads a past sales import, rebuilt from the product lines stored on the
// ImportLog and laid out like the template (so it can be fed straight back in).
// Values are literal rather than formulas — this is a record, not a form.
// Read-only, so viewInventory is enough.
export const dynamic = "force-dynamic";

const PH_TZ = "Asia/Manila";

export async function GET(request: Request) {
  try {
    await requireCan("viewInventory");
  } catch {
    return new Response("Not authorized.", { status: 403 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Missing id.", { status: 400 });

  const log = await prisma.importLog.findUnique({ where: { id } });
  if (!log) return new Response("Import not found.", { status: 404 });

  const { lines } = parseImportDetails(log.details);

  // Category + price for the imported names, so the sheet reads like the
  // original. Several menu items may share a name — the variation picks which
  // one, and its price overrides the base.
  const menuItems = await prisma.menuItem.findMany({
    where: { name: { in: lines.map((l) => l.product) } },
    include: { category: true },
  });
  const infoFor = (product: string, variation?: string) => {
    const matches = menuItems.filter((mi) => mi.name === product);
    if (matches.length === 0) return undefined;
    let chosen = matches[0];
    if (matches.length > 1 && variation) {
      const labelled = matches.filter(
        (mi) =>
          mi.hasVariation &&
          ((mi.variations as { label: string }[] | null) ?? []).some(
            (v) => v.label.toLowerCase() === variation.toLowerCase()
          )
      );
      if (labelled.length === 1) chosen = labelled[0];
    }
    const price =
      variation && chosen.hasVariation
        ? (((chosen.variations as { label: string; price: number }[] | null) ?? []).find(
            (v) => v.label.toLowerCase() === variation.toLowerCase()
          )?.price ?? chosen.price)
        : chosen.price;
    return { category: chosen.category.name, price };
  };

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Sales");
  const dateLabel = log.createdAt.toLocaleDateString("en-US", {
    timeZone: PH_TZ,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const rowDate = log.createdAt.toLocaleDateString("en-US", {
    timeZone: PH_TZ,
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
  let r = writeSalesSheetHeader(ws, dateLabel);

  let totalQty = 0;
  let totalAmount = 0;
  lines.forEach((line, i) => {
    const info = infoFor(line.product, line.variation);
    const lineTotal = info ? info.price * line.qty : null;
    totalQty += line.qty;
    if (lineTotal !== null) totalAmount += lineTotal;

    const row = ws.getRow(r);
    row.getCell(SALES_COL.txnId).value = `TXN-${String(i + 1).padStart(4, "0")}`;
    row.getCell(SALES_COL.date).value = rowDate;
    row.getCell(SALES_COL.menuItem).value = line.product;
    if (line.variation) row.getCell(SALES_COL.variation).value = line.variation;
    row.getCell(SALES_COL.category).value = info?.category ?? "";
    row.getCell(SALES_COL.qty).value = line.qty;
    row.getCell(SALES_COL.qty).alignment = { horizontal: "center" };
    if (info) {
      row.getCell(SALES_COL.unitPrice).value = info.price;
      row.getCell(SALES_COL.unitPrice).numFmt = "#,##0.00";
    }
    if (lineTotal !== null) {
      row.getCell(SALES_COL.total).value = lineTotal;
      row.getCell(SALES_COL.total).numFmt = "#,##0.00";
    }
    r += 1;
  });

  writeTotalRow(ws, r, { qty: totalQty, amount: totalAmount });

  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = log.fileName.toLowerCase().endsWith(".xlsx") ? log.fileName : `${log.fileName}.xlsx`;

  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}
