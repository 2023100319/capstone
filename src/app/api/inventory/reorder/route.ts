import ExcelJS from "exceljs";
import { getReorderList } from "@/app/actions/inventory";

// Exports the current reorder list (everything at or below its reorder level) as
// an .xlsx shopping list. getReorderList guards on viewInventory, so Supervisor
// and Owner can both pull it; anyone else gets the thrown permission error.
export const dynamic = "force-dynamic";

export async function GET() {
  let rows: Awaited<ReturnType<typeof getReorderList>>;
  try {
    rows = await getReorderList();
  } catch {
    return new Response("Not authorized.", { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Reorder List");

  ws.columns = [
    { header: "Ingredient", key: "ingredient", width: 32 },
    { header: "Category", key: "category", width: 20 },
    { header: "On hand", key: "onHand", width: 12 },
    { header: "Reorder level", key: "reorder", width: 14 },
    { header: "Suggested order", key: "suggested", width: 16 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Supplier", key: "supplier", width: 24 },
    { header: "Status", key: "status", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    ws.addRow({
      ingredient: r.ingredientName,
      category: r.categoryName,
      onHand: r.stockQuantity,
      reorder: r.reorderLevel,
      suggested: r.suggestedOrder,
      unit: r.unit,
      supplier: r.supplier || "",
      status: r.status === "OUT_OF_STOCK" ? "Out of Stock" : "Low",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="reorder-list-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
