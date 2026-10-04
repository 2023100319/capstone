import ExcelJS from "exceljs";
import { getMovementAnalytics } from "@/app/actions/inventory-reports";
import { normalizeDays } from "@/lib/analytics-period";

// Exports the inventory movement analytics for a period as an .xlsx: a Totals
// sheet plus Top Consumed and Top Wasted. getMovementAnalytics guards on
// viewInventory, so Supervisor and Owner can pull it; anyone else gets 403.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const days = normalizeDays(new URL(request.url).searchParams.get("days"));

  let data: Awaited<ReturnType<typeof getMovementAnalytics>>;
  try {
    data = await getMovementAnalytics(days);
  } catch {
    return new Response("Not authorized.", { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();

  const totals = workbook.addWorksheet("Totals");
  totals.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Quantity", key: "qty", width: 16 },
  ];
  totals.getRow(1).font = { bold: true };
  totals.addRow({ metric: `Period (days)`, qty: data.days });
  totals.addRow({ metric: "Consumed (sales)", qty: data.totals.consumed });
  totals.addRow({ metric: "Wasted", qty: data.totals.wasted });
  totals.addRow({ metric: "Expired", qty: data.totals.expired });
  totals.addRow({ metric: "Loss (wasted + expired)", qty: data.totals.loss });
  totals.addRow({ metric: "Restocked", qty: data.totals.restocked });
  totals.addRow({ metric: "Net adjustment", qty: data.totals.adjustedNet });

  const consumed = workbook.addWorksheet("Top Consumed");
  consumed.columns = [
    { header: "Ingredient", key: "name", width: 32 },
    { header: "Consumed", key: "qty", width: 14 },
    { header: "Unit", key: "unit", width: 10 },
  ];
  consumed.getRow(1).font = { bold: true };
  for (const r of data.topConsumed) consumed.addRow({ name: r.name, qty: r.qty, unit: r.unit });

  const wasted = workbook.addWorksheet("Top Wasted");
  wasted.columns = [
    { header: "Ingredient", key: "name", width: 32 },
    { header: "Lost", key: "qty", width: 14 },
    { header: "Unit", key: "unit", width: 10 },
  ];
  wasted.getRow(1).font = { bold: true };
  for (const r of data.topWasted) wasted.addRow({ name: r.name, qty: r.qty, unit: r.unit });

  // The Totals sheet can only ever be read per unit — grams and litres share its
  // column — so this sheet carries the same window ingredient by ingredient,
  // each row in its own unit. It mirrors the table on the report page.
  const detail = workbook.addWorksheet("By Ingredient");
  detail.columns = [
    { header: "Ingredient", key: "name", width: 32 },
    { header: "Category", key: "category", width: 20 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Used (sales)", key: "consumed", width: 14 },
    { header: "Wasted", key: "wasted", width: 12 },
    { header: "Expired", key: "expired", width: 12 },
    { header: "Restocked", key: "restocked", width: 14 },
    { header: "Correction", key: "adjustedNet", width: 14 },
    { header: "Movements", key: "movements", width: 12 },
    { header: "On hand now", key: "onHand", width: 14 },
  ];
  detail.getRow(1).font = { bold: true };
  for (const r of data.byIngredient) {
    detail.addRow({
      name: r.name,
      category: r.categoryName,
      unit: r.unit,
      consumed: r.consumed,
      wasted: r.wasted,
      expired: r.expired,
      restocked: r.restocked,
      adjustedNet: r.adjustedNet,
      movements: r.movements,
      onHand: r.onHand,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="inventory-report-${data.days}d-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
