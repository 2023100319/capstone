"use client";

import { useMemo, useState } from "react";
import { Search, Download, Receipt, FileSpreadsheet } from "lucide-react";
import type { TransactionRow, DailySummary } from "@/app/actions/transactions";
import { generateReceiptPdf } from "@/lib/receipt-pdf";
import { cn } from "@/lib/utils";

const METHOD_STYLE: Record<string, string> = {
  CASH: "bg-emerald-50 text-emerald-700",
  GCASH: "bg-blue-50 text-brand-blue",
  CARD: "bg-purple-50 text-purple-700",
};

const STATUS_STYLE: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700",
  REFUNDED: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
};

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  GCASH: "GCash",
  CARD: "Card",
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export function TransactionsView({
  rows,
  daily,
}: {
  rows: TransactionRow[];
  daily: DailySummary[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.orderNumber.toLowerCase().includes(q) ||
        r.cashierName.toLowerCase().includes(q) ||
        r.paymentMethod.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Transaction</h1>
        <div className="relative w-full sm:w-auto">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, cashier, method..."
            className="w-full rounded-lg bg-card py-2 pr-4 pl-9 text-sm text-foreground shadow-sm ring-1 ring-border transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50 sm:w-72"
          />
        </div>
      </div>

      {/* Daily Sales — auto-generated whole-day files, newest first (history). */}
      <div className="rounded-2xl bg-card shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Daily Sales</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Each day&apos;s transactions, compiled automatically. Download the Excel file per day.
          </p>
        </div>
        {daily.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No sales recorded yet today.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {daily.map((d, i) => (
              <li
                key={d.date}
                className="flex flex-wrap items-center gap-3 px-6 py-3.5 transition-colors hover:bg-muted/40"
              >
                <FileSpreadsheet className="h-5 w-5 flex-shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    POS_DAILY_TRANSACTION_{d.date}.xlsx
                    {i === 0 && (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Today
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.label} · {d.orderCount} order{d.orderCount === 1 ? "" : "s"} · ₱
                    {d.totalSales.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <a
                  href={`/staff/transactions/daily?date=${d.date}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:bg-brand-blue-dark active:scale-[.98]"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl bg-card shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Date &amp; Time</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Order #</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Cashier</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Method</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Amount</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">
                    <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    {rows.length === 0 ? "No transactions yet." : "No transactions match your search."}
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                    <td className="px-6 py-4 text-muted-foreground">
                      {t.createdAt.toLocaleString("en-PH", DATE_FORMAT)}
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">{t.orderNumber}</td>
                    <td className="px-6 py-4 text-foreground/80">{t.cashierName}</td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          METHOD_STYLE[t.paymentMethod] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {METHOD_LABEL[t.paymentMethod] ?? t.paymentMethod}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-foreground">
                      ₱{t.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                          STATUS_STYLE[t.status] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {t.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => generateReceiptPdf(t)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:bg-brand-blue-dark active:scale-[.98]"
                      >
                        <Download className="h-3.5 w-3.5" /> Receipt PDF
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
