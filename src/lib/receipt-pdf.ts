import { jsPDF } from "jspdf";
import { BRANCH_NAME } from "@/lib/branch";
import type { TransactionRow } from "@/app/actions/transactions";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  GCASH: "GCash",
  CARD: "Card",
};

// jsPDF's built-in Helvetica uses WinAnsi encoding, which has no ₱ glyph, so
// the receipt spells out "PHP" instead of using the peso sign.
function money(n: number) {
  return `PHP ${n.toFixed(2)}`;
}

/**
 * Builds a thermal-style (80mm) receipt for a transaction and triggers a
 * one-click PDF download. Runs entirely in the browser — no server round-trip.
 */
export function generateReceiptPdf(tx: TransactionRow) {
  const width = 80; // mm — standard thermal receipt width
  const margin = 6;
  const contentW = width - margin * 2;
  const lineH = 5;

  // Estimate height from the number of line items so nothing clips.
  const height = 90 + tx.items.length * lineH + 40;
  const doc = new jsPDF({ unit: "mm", format: [width, height] });

  let y = 10;
  const center = width / 2;

  // ---- Header ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("ERICAHLICIOUS", center, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("Brew & Bake", center, y, { align: "center" });
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`${BRANCH_NAME} Branch`, center, y, { align: "center" });
  y += 6;

  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, width - margin, y);
  doc.setLineDashPattern([], 0);
  y += 5;

  // ---- Meta ----
  doc.setFontSize(8);
  const meta: [string, string][] = [
    ["Order #", tx.orderNumber],
    ["Date", tx.createdAt.toLocaleString("en-PH", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })],
    ["Cashier", tx.cashierName],
    ["Type", tx.orderType === "DINE_IN" ? "Dine In" : "Take Out"],
  ];
  for (const [label, value] of meta) {
    doc.setFont("helvetica", "normal");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(value, width - margin, y, { align: "right" });
    y += lineH;
  }
  y += 1;

  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, width - margin, y);
  doc.setLineDashPattern([], 0);
  y += 5;

  // ---- Items ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Item", margin, y);
  doc.text("Qty", margin + contentW * 0.62, y, { align: "right" });
  doc.text("Total", width - margin, y, { align: "right" });
  y += lineH;
  doc.setFont("helvetica", "normal");

  let subtotal = 0;
  for (const item of tx.items) {
    const lineTotal = item.price * item.qty;
    subtotal += lineTotal;
    const name = item.variation ? `${item.name} (${item.variation})` : item.name;
    const nameLines = doc.splitTextToSize(name, contentW * 0.58) as string[];
    doc.text(nameLines, margin, y);
    doc.text(String(item.qty), margin + contentW * 0.62, y, { align: "right" });
    doc.text(money(lineTotal), width - margin, y, { align: "right" });
    y += lineH * Math.max(1, nameLines.length);
  }

  y += 1;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, width - margin, y);
  doc.setLineDashPattern([], 0);
  y += 5;

  // ---- Totals ----
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal", margin, y);
  doc.text(money(subtotal), width - margin, y, { align: "right" });
  y += lineH;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL", margin, y);
  doc.text(money(tx.amount), width - margin, y, { align: "right" });
  y += lineH + 1;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Payment", margin, y);
  doc.text(PAYMENT_LABELS[tx.paymentMethod] ?? tx.paymentMethod, width - margin, y, { align: "right" });
  y += lineH + 3;

  // ---- Footer ----
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, width - margin, y);
  doc.setLineDashPattern([], 0);
  y += 6;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.text("Thank you for ordering!", center, y, { align: "center" });
  y += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("This serves as your official receipt.", center, y, { align: "center" });

  doc.save(`ericahlicious_receipt_${tx.orderNumber}.pdf`);
}
