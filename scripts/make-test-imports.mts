// Generates sample sales-import spreadsheets for exercising /inventory/import.
//
//   npm run test-imports
//
// Writes 7 .xlsx files into ./test-imports/ — see test-imports/README.md for what
// each one is and the preview it should produce.
//
// The layout comes from src/lib/sales-sheet.ts, the same module the downloadable
// template and the re-download of a past import are built from, so a change to
// the client's sheet can't leave these fixtures behind. That is also why this is
// a .mts run through tsx rather than a plain .mjs: it can import the real thing.
//
// Product names, categories and prices below mirror the live menu (all 8 items
// are AVAILABLE and have recipes). Keep them in step with the database, or the
// "matched" fixtures start reporting rows as unmatched.
//
// NOTE: the current menu has no duplicate product names and no recipe-less items,
// so the "ambiguous" and "no-recipe" skip statuses can't be produced from real
// data — these files cover matched / unmatched / bad-qty / insufficient instead.

import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SALES_COL,
  writeAutoFormulas,
  writeProductsSheet,
  writeRowValidation,
  writeSalesSheetHeader,
  writeTotalRow,
  type SalesProduct,
} from "../src/lib/sales-sheet";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "test-imports");

/** The live menu. Category and price fill the sheet's auto columns so a fixture
 *  reads like a real day's transactions rather than a bare two-column list. */
const PRODUCTS: SalesProduct[] = [
  { name: "Spanish Latte", category: "Coffee / Iced Drinks", price: 160 },
  { name: "Flavored Americano", category: "Coffee / Iced Drinks", price: 175 },
  { name: "Chocolate Java Chip Frappe", category: "Coffee / Iced Drinks", price: 210 },
  { name: "Cheesy Bacon Fries", category: "Pica-Pica / Snacks", price: 165 },
  { name: "Red Velvet Cake", category: "Cakes", price: 220 },
  { name: "Sans Rival", category: "Sweet Drinks", price: 195 },
  { name: "Chicken Alfredo Pasta", category: "Pasta", price: 315 },
  { name: "Filipino Breakfast Danggit", category: "Rice Meals", price: 320 },
];

const BY_NAME = new Map(PRODUCTS.map((p) => [p.name, p]));

const DATE_LABEL = "July 20, 2026";
const ROW_DATE = "7/20/2026";
const TIMES = ["8:15 AM", "9:10 AM", "10:05 AM", "11:40 AM", "1:20 PM", "3:05 PM", "5:30 PM", "7:15 PM"];

type Row = [product: string, quantity: number | string];

/** A quantity only counts towards the totals when it's a real positive number —
 *  the deliberately broken rows ("sold out", 0) leave Total blank, exactly as
 *  Excel would. */
function saleAmount(product: string, quantity: number | string) {
  const info = BY_NAME.get(product);
  if (!info || typeof quantity !== "number" || quantity < 1) return null;
  return info.price * quantity;
}

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  // Formulas are written without cached results, so ask Excel to calculate them
  // the moment the file opens — otherwise the auto columns look empty.
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

async function save(wb: ExcelJS.Workbook, fileName: string, rowCount: number) {
  await wb.xlsx.writeFile(join(OUT_DIR, fileName));
  console.log(`  ✓ ${fileName} (${rowCount} rows)`);
}

/**
 * A saved day's sheet: the client's layout with every column already filled in,
 * the way it looks once Excel has calculated the template and the file has been
 * saved. Values are literal — this is the common case the parser meets.
 */
async function write(fileName: string, rows: Row[]) {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Sales");
  const first = writeSalesSheetHeader(ws, DATE_LABEL);

  let totalQty = 0;
  let totalAmount = 0;

  rows.forEach(([product, quantity], i) => {
    const row = ws.getRow(first + i);
    const info = BY_NAME.get(product);
    const amount = saleAmount(product, quantity);

    if (product) row.getCell(SALES_COL.txnId).value = `TXN-${String(i + 1).padStart(4, "0")}`;
    if (product) row.getCell(SALES_COL.date).value = ROW_DATE;
    if (product) row.getCell(SALES_COL.time).value = TIMES[i % TIMES.length];
    row.getCell(SALES_COL.menuItem).value = product;
    row.getCell(SALES_COL.qty).value = quantity;
    row.getCell(SALES_COL.qty).alignment = { horizontal: "center" };

    // Blank for a name that isn't on the menu — there's nothing to look up.
    if (info) {
      row.getCell(SALES_COL.category).value = info.category;
      row.getCell(SALES_COL.unitPrice).value = info.price;
      row.getCell(SALES_COL.unitPrice).numFmt = "#,##0.00";
    }
    if (amount !== null) {
      row.getCell(SALES_COL.total).value = amount;
      row.getCell(SALES_COL.total).numFmt = "#,##0.00";
      totalQty += quantity as number;
      totalAmount += amount;
    }
  });

  writeTotalRow(ws, first + rows.length, { qty: totalQty, amount: totalAmount });
  await save(wb, fileName, rows.length);
}

/**
 * The downloadable template with a few rows typed in and the rest left blank —
 * what a client actually uploads. Built through the same helpers as
 * /api/sales-import/template, so Transaction ID, Category, Unit Price and Total
 * are live formulas and the TOTAL row is a real SUM over the whole range.
 *
 * This is the fixture that proves the parser's two guards hold: the ~196 unused
 * rows carry formula objects rather than empty cells, and the TOTAL row's SUM
 * would otherwise be read as a quantity with no product.
 */
async function writeFromTemplate(fileName: string, rows: Row[], dataRows = 200) {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Sales");
  const first = writeSalesSheetHeader(ws, DATE_LABEL);
  const last = first + dataRows - 1;

  writeProductsSheet(wb, PRODUCTS);

  for (let r = first; r <= last; r++) {
    const row = ws.getRow(r);
    writeAutoFormulas(row, r);
    writeRowValidation(row, PRODUCTS.length);

    const filled = rows[r - first];
    if (filled) {
      row.getCell(SALES_COL.date).value = ROW_DATE;
      row.getCell(SALES_COL.time).value = TIMES[(r - first) % TIMES.length];
      row.getCell(SALES_COL.menuItem).value = filled[0];
      row.getCell(SALES_COL.qty).value = filled[1];
    }
  }

  writeTotalRow(ws, last + 1, { range: [first, last] });
  await save(wb, fileName, rows.length);
}

/** The old flat two-column sheet, kept to prove the parser stays backwards compatible. */
async function writeFlat(
  fileName: string,
  { productHeader = "Product", qtyHeader = "Quantity", rows }: {
    productHeader?: string;
    qtyHeader?: string;
    rows: Row[];
  }
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sales");
  ws.columns = [
    { header: productHeader, key: "product", width: 40 },
    { header: qtyHeader, key: "quantity", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const [product, quantity] of rows) {
    ws.addRow({ product, quantity });
  }
  await save(wb, fileName, rows.length);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Writing test imports to ${OUT_DIR}`);

  // 1. Happy path — a few valid products, small quantities.
  await write("sales-basic.xlsx", [
    ["Spanish Latte", 5],
    ["Flavored Americano", 8],
    ["Cheesy Bacon Fries", 3],
    ["Red Velvet Cake", 2],
  ]);

  // 2. Full day — all 8 products (26 unique ingredients). This is the heavy
  //    transaction that reproduced the P2028 timeout; use it to confirm the fix.
  await write("sales-fullday.xlsx", [
    ["Chicken Alfredo Pasta", 6],
    ["Filipino Breakfast Danggit", 5],
    ["Cheesy Bacon Fries", 9],
    ["Chocolate Java Chip Frappe", 12],
    ["Flavored Americano", 15],
    ["Red Velvet Cake", 7],
    ["Sans Rival", 4],
    ["Spanish Latte", 11],
  ]);

  // 3. Mixed — valid rows plus an unmatched name, a zero qty and a text qty
  //    (both bad-qty), and a blank line. Exercises the skip classification.
  await write("sales-with-skips.xlsx", [
    ["Spanish Latte", 4], // matched
    ["Matcha Cloud Latte", 3], // unmatched — not on the menu
    ["Flavored Americano", 0], // bad-qty — must be >= 1
    ["Cheesy Bacon Fries", "sold out"], // bad-qty — not a number
    ["", ""], // blank line — ignored
    ["Red Velvet Cake", 2], // matched
  ]);

  // 4. Insufficient stock — quantities far beyond what's on hand, so ingredients
  //    deduct to 0 and get flagged "insufficient".
  await write("sales-insufficient.xlsx", [
    ["Chocolate Java Chip Frappe", 9999],
    ["Chicken Alfredo Pasta", 9999],
  ]);

  // 5. The downloaded template, filled in — the realistic upload.
  await writeFromTemplate("sales-from-template.xlsx", [
    ["Spanish Latte", 7],
    ["Cheesy Bacon Fries", 4],
    ["Sans Rival", 2],
    ["Flavored Americano", 6],
  ]);

  // 6. Alternate headers (Item / Sold) on the old flat sheet, plus messy names —
  //    extra spaces and mixed case — to exercise header auto-detect and
  //    name normalization.
  await writeFlat("sales-alt-headers.xlsx", {
    productHeader: "Item",
    qtyHeader: "Sold",
    rows: [
      ["  cheesy  bacon FRIES ", 3],
      ["spanish latte", 6],
      ["FLAVORED AMERICANO", 4],
    ],
  });

  // 7. The pre-redesign template shape — files saved before the layout change
  //    must still import.
  await writeFlat("sales-legacy-headers.xlsx", {
    rows: [
      ["Spanish Latte", 3],
      ["Red Velvet Cake", 1],
      ["Sans Rival", 2],
    ],
  });

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
