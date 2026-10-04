import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import {
  SALES_COL,
  SALES_HEADER_ROW,
  writeAutoFormulas,
  writeProductsSheet,
  writeRowValidation,
  writeSalesSheetHeader,
  writeTotalRow,
  writeVariationsSheet,
} from "@/lib/sales-sheet";

// Downloadable starter template for the sales import, laid out like the client's
// POS daily transaction sheet (title + date banner, headers on row 3, TOTAL row)
// minus the "OR No." column they asked us to drop.
//
// The user only types Date, Time, Menu Item and Qty: Menu Item is a drop-down
// backed by a hidden "Products" sheet (so names always match a real menu item),
// and Transaction ID / Category / Unit Price / Total fill themselves from there.
export const dynamic = "force-dynamic";

const PH_TZ = "Asia/Manila";

/** How many fillable rows sit between the headers and the TOTAL row. */
const DATA_ROWS = 200;

export async function GET() {
  const products = await prisma.menuItem.findMany({
    where: { status: "AVAILABLE" },
    orderBy: { name: "asc" },
    include: { category: true },
  });
  const examples = products.slice(0, 3);

  // Product+variation pairs for the variation-aware price lookups, plus the
  // distinct labels behind the Variation column's drop-down.
  const variations = products.flatMap((p) =>
    ((p.variations as { label: string; price: number }[] | null) ?? []).map((v) => ({
      product: p.name,
      variation: v.label,
      price: v.price,
    }))
  );
  const variationLabels = [
    ...new Set(
      products
        .flatMap((p) => ((p.variations as { label: string }[] | null) ?? []).map((v) => v.label))
        .sort((a, b) => a.localeCompare(b))
    ),
  ];

  const workbook = new ExcelJS.Workbook();
  // Formulas are written without cached results, so ask Excel to calculate them
  // the moment the file opens — otherwise the auto columns look empty.
  workbook.calcProperties.fullCalcOnLoad = true;

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    timeZone: PH_TZ,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const exampleDate = today.toLocaleDateString("en-US", {
    timeZone: PH_TZ,
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });

  // Data sheet FIRST — the parser reads worksheets[0].
  const ws = workbook.addWorksheet("Sales");
  const firstRow = writeSalesSheetHeader(ws, dateLabel);
  const lastRow = firstRow + DATA_ROWS - 1;
  const totalRow = lastRow + 1;

  ws.getRow(SALES_HEADER_ROW).getCell(SALES_COL.menuItem).note =
    "Pick each item sold from the drop-down and enter the quantity. Pick the " +
    "variation too for items that have one — their ingredients differ per size. " +
    "Transaction ID, Category, Unit Price and Total fill in automatically — " +
    "replace the example rows with the day's own sales.";

  writeProductsSheet(
    workbook,
    products.map((p) => ({ name: p.name, category: p.category.name, price: p.price })),
    variations
  );
  writeVariationsSheet(workbook, variationLabels);

  const exampleTimes = ["8:15 AM", "9:10 AM", "10:05 AM"];

  for (let r = firstRow; r <= lastRow; r++) {
    const row = ws.getRow(r);

    writeAutoFormulas(row, r);
    writeRowValidation(row, products.length, variationLabels.length);

    // A few filled-in rows so the format is unmistakable.
    const example = examples[r - firstRow];
    if (example) {
      row.getCell(SALES_COL.date).value = exampleDate;
      row.getCell(SALES_COL.time).value = exampleTimes[r - firstRow];
      row.getCell(SALES_COL.menuItem).value = example.name;
      // Show the column off with the first variation when the example item has one.
      const exampleVariation = (
        (example.variations as { label: string }[] | null) ?? []
      )[0]?.label;
      if (exampleVariation) row.getCell(SALES_COL.variation).value = exampleVariation;
      row.getCell(SALES_COL.qty).value = (r - firstRow + 1) * 2;
    }
  }

  writeTotalRow(ws, totalRow, { range: [firstRow, lastRow] });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="sales-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
