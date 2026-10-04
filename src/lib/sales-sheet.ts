import type ExcelJS from "exceljs";

/**
 * The shared shape of a sales sheet: the client's POS daily-transaction layout
 * (title banner, date banner, headers on row 3) minus the "OR No." column they
 * asked us to drop. Both the downloadable import template and the re-download of
 * a past import are built from this so the two files look like the same document.
 *
 * The importer reads "Menu Item", "Variation" (optional) and "Qty" — the rest is
 * presentation. The Variation column feeds the per-variation recipes: a row
 * naming a variation of a menu item deducts exactly that variation's ingredient
 * set, and a variation-item row without one is skipped as "needs variation".
 */

export const SALES_TITLE = "ERICAHLICIOUS BREW AND BAKE - DAILY SALES TRANSACTION";

export const SALES_HEADERS = [
  "Transaction ID", "Date", "Time", "Menu Item", "Variation",
  "Category", "Qty", "Unit Price (₱)", "Total (₱)",
] as const;

const WIDTHS = [16, 12, 11, 26, 14, 16, 8, 15, 14];

/** 1-based column positions, so callers don't juggle magic letters. */
export const SALES_COL = {
  txnId: 1,
  date: 2,
  time: 3,
  menuItem: 4,
  variation: 5,
  category: 6,
  qty: 7,
  unitPrice: 8,
  total: 9,
} as const;

/** The row the headers sit on, and therefore the first row of data. */
export const SALES_HEADER_ROW = 3;
export const SALES_FIRST_DATA_ROW = SALES_HEADER_ROW + 1;

/**
 * Writes the banner + header block onto a fresh worksheet and sets the column
 * widths. `dateLabel` fills the row-2 banner ("Date: July 20, 2026"); pass a
 * blank-ish label for a template the user fills in themselves.
 */
export function writeSalesSheetHeader(ws: ExcelJS.Worksheet, dateLabel: string) {
  WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  ws.mergeCells(1, 1, 1, SALES_HEADERS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = SALES_TITLE;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, SALES_HEADERS.length);
  const dateCell = ws.getCell(2, 1);
  dateCell.value = `Date: ${dateLabel}`;
  dateCell.font = { bold: true, size: 12 };
  dateCell.alignment = { horizontal: "center" };
  ws.getRow(2).height = 20;

  const headerRow = ws.getRow(SALES_HEADER_ROW);
  SALES_HEADERS.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1A1A" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  headerRow.height = 20;

  // Keep the banner + headers in view while scrolling a long day of sales.
  ws.views = [{ state: "frozen", ySplit: SALES_HEADER_ROW }];

  return SALES_FIRST_DATA_ROW;
}

/**
 * The self-filling columns of a template row — Transaction ID, Category,
 * Unit Price and Total — where `rowNumber` is the sheet row being written.
 * Category and the base Unit Price come from the hidden "Products" sheet, so the
 * workbook this is used in must have one (columns A=name, B=category, C=price,
 * plus optional E=key "name|variation", F=variation price).
 *
 * When the row names a variation (column E), Unit Price looks up the
 * product+variation pair first and falls back to the base price; the Total
 * multiplies whatever price that produced.
 *
 * Every formula is guarded on a blank Menu Item so the rows nobody filled in
 * stay visually empty instead of filling the sheet with #N/A.
 */
export function writeAutoFormulas(row: ExcelJS.Row, rowNumber: number) {
  const r = rowNumber;

  row.getCell(SALES_COL.txnId).value = {
    formula: `IF($D${r}="","","TXN-"&TEXT(ROW()-${SALES_HEADER_ROW},"0000"))`,
  };
  row.getCell(SALES_COL.category).value = {
    formula: `IF($D${r}="","",IFERROR(VLOOKUP($D${r},Products!$A:$C,2,FALSE),""))`,
  };
  row.getCell(SALES_COL.unitPrice).value = {
    formula:
      `IF($D${r}="","",IFERROR(VLOOKUP($D${r}&"|"&$E${r},Products!$E:$F,2,FALSE),` +
      `IFERROR(VLOOKUP($D${r},Products!$A:$C,3,FALSE),"")))`,
  };
  row.getCell(SALES_COL.total).value = {
    formula: `IF(OR($D${r}="",$G${r}=""),"",$G${r}*$H${r})`,
  };

  row.getCell(SALES_COL.unitPrice).numFmt = "#,##0.00";
  row.getCell(SALES_COL.total).numFmt = "#,##0.00";
  row.getCell(SALES_COL.qty).alignment = { horizontal: "center" };
}

export type SalesProduct = { name: string; category: string; price: number };
export type SalesProductVariation = { product: string; variation: string; price: number };

/**
 * The reference sheet behind the Menu Item drop-down and the look-ups above.
 * Hidden so it stays out of the way: columns A–C (name, category, price) are
 * what the base VLOOKUPs expect, and E–F hold the product+variation price pairs
 * keyed by "name|variation" for the variation-aware price lookup.
 */
export function writeProductsSheet(
  workbook: ExcelJS.Workbook,
  products: SalesProduct[],
  variations: SalesProductVariation[] = []
) {
  const ref = workbook.addWorksheet("Products");
  ref.getCell("A1").value = "Product";
  ref.getCell("B1").value = "Category";
  ref.getCell("C1").value = "Price";
  ref.getCell("E1").value = "Key";
  ref.getCell("F1").value = "Variation Price";
  ref.getColumn(1).width = 40;
  ref.getColumn(2).width = 20;
  ref.getColumn(5).width = 40;

  products.forEach((p, i) => {
    const r = i + 2;
    ref.getCell(`A${r}`).value = p.name;
    ref.getCell(`B${r}`).value = p.category;
    ref.getCell(`C${r}`).value = p.price;
  });

  variations.forEach((v, i) => {
    const r = i + 2;
    ref.getCell(`E${r}`).value = `${v.product}|${v.variation}`;
    ref.getCell(`F${r}`).value = v.price;
  });

  ref.state = "veryHidden";
  return ref;
}

/**
 * The distinct variation labels, on a hidden sheet the Variation column's
 * drop-down reads from. Per-product pairing is not validated here — a label
 * picked for the wrong product is caught on import as a skipped row, the same
 * way an unknown product name is.
 */
export function writeVariationsSheet(
  workbook: ExcelJS.Workbook,
  labels: string[]
) {
  const ref = workbook.addWorksheet("Variations");
  ref.getCell("A1").value = "Variation";
  ref.getColumn(1).width = 20;
  labels.forEach((label, i) => {
    ref.getCell(`A${i + 2}`).value = label;
  });
  ref.state = "veryHidden";
  return ref;
}

/**
 * Drop-downs on Menu Item and Variation (label list, blank allowed) + whole
 * numbers only on Qty, so names always match the menu exactly and nothing gets
 * skipped on import. `productCount` / `variationCount` are the row counts on
 * the Products and Variations sheets.
 */
export function writeRowValidation(
  row: ExcelJS.Row,
  productCount: number,
  variationCount = 0
) {
  if (productCount === 0) return;

  row.getCell(SALES_COL.menuItem).dataValidation = {
    type: "list",
    allowBlank: true,
    formulae: [`=Products!$A$2:$A$${productCount + 1}`],
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: "Unknown item",
    error: "Pick an item from the list so it matches your menu exactly.",
  };
  if (variationCount > 0) {
    row.getCell(SALES_COL.variation).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`=Variations!$A$2:$A$${variationCount + 1}`],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Unknown variation",
      error: "Pick a variation from the list, or leave it blank for items with none.",
    };
  }
  row.getCell(SALES_COL.qty).dataValidation = {
    type: "whole",
    operator: "greaterThanOrEqual",
    allowBlank: true,
    formulae: ["1"],
    showErrorMessage: true,
    errorStyle: "stop",
    errorTitle: "Invalid quantity",
    error: "Quantity must be a whole number of 1 or more.",
  };
}

/**
 * The closing TOTAL row, matching the client's sheet. Pass a `[first, last]`
 * range to sum it in Excel, or plain numbers to write the totals literally (the
 * re-download of a past import is a record, not a form).
 */
export function writeTotalRow(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  totals: { range: [number, number] } | { qty: number; amount: number }
) {
  const row = ws.getRow(rowNumber);

  row.getCell(SALES_COL.category).value = "TOTAL";
  row.getCell(SALES_COL.category).font = { bold: true };
  row.getCell(SALES_COL.category).alignment = { horizontal: "right" };

  if ("range" in totals) {
    const [first, last] = totals.range;
    row.getCell(SALES_COL.qty).value = { formula: `SUM(G${first}:G${last})` };
    row.getCell(SALES_COL.total).value = { formula: `SUM(I${first}:I${last})` };
  } else {
    row.getCell(SALES_COL.qty).value = totals.qty;
    row.getCell(SALES_COL.total).value = totals.amount;
  }

  row.getCell(SALES_COL.qty).font = { bold: true };
  row.getCell(SALES_COL.qty).alignment = { horizontal: "center" };
  row.getCell(SALES_COL.total).font = { bold: true };
  row.getCell(SALES_COL.total).numFmt = "#,##0.00";

  return row;
}
