"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Download, FileDown, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, X,
  UploadCloud, ListChecks, MinusCircle, Boxes, PackageMinus, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/brand/stat-card";
import {
  previewSalesImport,
  applySalesImport,
  type PreviewResult,
  type PreviewRowStatus,
  type IngredientImpact,
} from "@/app/actions/sales-import";
import type { ImportProductLine } from "@/lib/import-details";
import { cn } from "@/lib/utils";

type ImportLogRow = {
  id: string;
  fileName: string;
  rowCount: number;
  appliedCount: number;
  skippedCount: number;
  totalUnits: number;
  uploadedBy: string;
  createdAt: string;
  lines: ImportProductLine[];
  impact: IngredientImpact[];
};

type Preview = Extract<PreviewResult, { success: true }>;

const STATUS_BADGE: Record<PreviewRowStatus, { label: string; className: string }> = {
  matched: { label: "Will deduct", className: "bg-emerald-50 text-emerald-700" },
  "no-recipe": { label: "No recipe — skipped", className: "bg-amber-50 text-amber-700" },
  unmatched: { label: "Not found — skipped", className: "bg-red-50 text-red-700" },
  ambiguous: { label: "Name not unique — skipped", className: "bg-amber-50 text-amber-700" },
  "needs-variation": {
    label: "Missing variation — skipped",
    className: "bg-amber-50 text-amber-700",
  },
  "bad-variation": {
    label: "Unknown variation — skipped",
    className: "bg-red-50 text-red-700",
  },
  "bad-qty": { label: "Bad quantity — skipped", className: "bg-muted text-muted-foreground" },
};

const STEPS = [
  { icon: FileDown, title: "Download the template", body: "It's pre-filled with your products and drop-downs." },
  { icon: ListChecks, title: "Fill in the sales", body: "Date, time, menu item, variation and qty — the rest fills itself." },
  { icon: CheckCircle2, title: "Upload & review", body: "Preview the deductions, then apply — nothing changes until you confirm." },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SalesImportManager({
  logs,
  canManage,
}: {
  logs: ImportLogRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string>("");
  const [viewing, setViewing] = useState<ImportLogRow | null>(null);
  const [confirmingDirect, setConfirmingDirect] = useState(false);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPreview(null);
    setError("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  /** Close the preview modal but keep the chosen file, so the user can re-preview
   *  or apply it. (reset() fully clears the file — used by Choose another / remove.) */
  function closePreview() {
    setPreview(null);
  }

  /** Accept a picked/dropped file after a light client-side extension check. */
  function chooseFile(picked: File | undefined | null) {
    setError("");
    setDone("");
    setPreview(null);
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith(".xlsx")) {
      setError("Please choose an Excel .xlsx file.");
      return;
    }
    setFile(picked);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!canManage) return;
    chooseFile(e.dataTransfer.files?.[0]);
  }

  function onPreview() {
    if (!file) {
      setError("Please choose an Excel file first.");
      return;
    }
    setError("");
    setDone("");
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const result = await previewSalesImport(fd);
      if (!result.success) {
        setError(result.error);
        setPreview(null);
        return;
      }
      setPreview(result);
    });
  }

  function onApply() {
    if (!preview) return;
    setError("");
    startTransition(async () => {
      const result = await applySalesImport(preview.apply, preview.fileName);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDone(
        `Imported ${preview.fileName}: ${result.applied} product line${result.applied === 1 ? "" : "s"} (${result.totalUnits} sold) deducted across ${result.deducted} ingredient${result.deducted === 1 ? "" : "s"}.`
      );
      reset();
      router.refresh();
    });
  }

  /** Import straight from the chosen file, skipping the preview. Parses + validates
   *  server-side (previewSalesImport) to get the trusted apply lines, then applies.
   *  Gated behind a confirm because it deducts stock and can't be undone. */
  function onApplyDirect() {
    if (!file) {
      setError("Please choose an Excel file first.");
      return;
    }
    setError("");
    setDone("");
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const parsed = await previewSalesImport(fd);
      if (!parsed.success) {
        setError(parsed.error);
        return;
      }
      if (parsed.totals.applied === 0) {
        setError("Nothing to import — no rows matched a product with a recipe.");
        setPreview(parsed);
        return;
      }
      const result = await applySalesImport(parsed.apply, parsed.fileName);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDone(
        `Imported ${parsed.fileName}: ${result.applied} product line${result.applied === 1 ? "" : "s"} (${result.totalUnits} sold) deducted across ${result.deducted} ingredient${result.deducted === 1 ? "" : "s"}.`
      );
      reset();
      router.refresh();
    });
  }

  const previewing = isPending && !preview;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Sales</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload the day&apos;s sales (Excel) to deduct ingredients from inventory automatically.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
              <step.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                <span className="text-brand-blue">{i + 1}.</span> {step.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{step.body}</p>
            </div>
          </div>
        ))}
      </div>

      {done && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{done}</span>
        </div>
      )}

      {canManage && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Dropzone */}
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardContent className="pt-6">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => chooseFile(e.target.files?.[0])}
                className="hidden"
              />

              {!file ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
                    dragging
                      ? "border-brand-blue bg-brand-blue/5"
                      : "border-border bg-muted/30 hover:border-brand-blue/50 hover:bg-muted/50"
                  )}
                >
                  <UploadCloud className={cn("h-10 w-10", dragging ? "text-brand-blue" : "text-muted-foreground")} />
                  <p className="text-sm font-medium text-foreground">
                    Drop your <span className="text-brand-blue">.xlsx</span> here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">Max 5&nbsp;MB · one sheet with Menu Item &amp; Qty columns</p>
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3">
                    <FileSpreadsheet className="h-8 w-8 flex-shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{fmtSize(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={reset}
                      aria-label="Remove file"
                      disabled={isPending}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={onPreview}
                      disabled={isPending}
                      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-brand-blue-dark active:scale-[.98] disabled:opacity-60"
                    >
                      {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      Preview deductions
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={isPending}
                      className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      Choose another
                    </button>
                    <button
                      onClick={() => {
                        setError("");
                        setConfirmingDirect(true);
                      }}
                      disabled={isPending}
                      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-brand-blue-dark active:scale-[.98] disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Apply Import
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Template */}
          <Card className="border-0 bg-brand-navy text-white shadow-sm">
            <CardContent className="flex h-full flex-col justify-between gap-4 pt-6">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-semibold">Need the format?</p>
                <p className="mt-1 text-xs text-white/70">
                  Download the template — it follows the daily sales transaction sheet and lists your
                  items as drop-downs, so names always match and nothing gets skipped.
                </p>
              </div>
              <a
                href="/api/sales-import/template"
                className="flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-white/90"
              >
                <Download className="h-4 w-4" /> Download template
              </a>
            </CardContent>
          </Card>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Preview — a modal so it overlays the page instead of pushing it down */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closePreview}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="flex min-w-0 items-center gap-2 text-lg font-bold text-foreground">
                <FileSpreadsheet className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <span className="truncate">Preview — {preview.fileName}</span>
              </h2>
              <button
                onClick={closePreview}
                aria-label="Discard preview"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
            {/* Summary chips */}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard label="Will deduct" value={String(preview.totals.applied)} icon={CheckCircle2} tint="green" sub={`of ${preview.totals.rowCount} rows`} />
              <StatCard label="Skipped" value={String(preview.totals.skipped)} icon={MinusCircle} tint="amber" />
              <StatCard label="Items sold" value={num(preview.totals.totalUnits)} icon={Boxes} tint="blue" />
              <StatCard label="Stock lines affected" value={String(preview.impact.length)} icon={PackageMinus} tint="navy" />
            </div>

            {preview.possibleDuplicate && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                A file named <strong>{preview.fileName}</strong> was already imported in the last 24
                hours. Applying again will deduct the stock a second time.
              </div>
            )}

            {/* Rows */}
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Row</th>
                    <th className="px-4 py-2 font-medium">Product</th>
                    <th className="px-4 py-2 font-medium">Variation</th>
                    <th className="px-4 py-2 font-medium">Qty</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => {
                    const badge = STATUS_BADGE[r.status];
                    return (
                      <tr key={r.rowNumber} className="border-b last:border-0">
                        <td className="px-4 py-2 text-muted-foreground">{r.rowNumber}</td>
                        <td className="px-4 py-2 text-foreground">{r.product || <span className="text-muted-foreground">(blank)</span>}</td>
                        <td className="px-4 py-2 text-foreground">{r.variation || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-2 text-foreground">{r.qty ?? "—"}</td>
                        <td className="px-4 py-2">
                          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", badge.className)}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Stock impact — ingredients, plus any counted item sold. */}
            {preview.impact.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Stock impact</p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Item</th>
                        <th className="px-4 py-2 font-medium">Deduct</th>
                        <th className="px-4 py-2 font-medium">In stock</th>
                        <th className="px-4 py-2 font-medium">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.impact.map((i) => (
                        <tr key={i.inventoryItemId} className="border-b last:border-0">
                          <td className="px-4 py-2 text-foreground">
                            {i.name}
                            {/* Say which stock moved — the two live in different places. */}
                            {i.kind === "item" && (
                              <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                                counted item
                              </span>
                            )}
                            {i.insufficient && (
                              <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                                insufficient
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-foreground">−{num(i.deduct)} {i.unit}</td>
                          <td className="px-4 py-2 text-muted-foreground">{num(i.before)} {i.unit}</td>
                          <td className={cn("px-4 py-2 font-medium", i.insufficient ? "text-red-600" : "text-foreground")}>
                            {num(i.remaining)} {i.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={closePreview}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={onApply}
                disabled={isPending || preview.totals.applied === 0}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-brand-blue-dark active:scale-[.98] disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Apply import
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm — direct apply skips the preview, so make the deduction explicit */}
      {confirmingDirect && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmingDirect(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-foreground">Apply without previewing?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This deducts ingredient stock for <strong className="text-foreground">{file?.name}</strong> right
                  away and can&apos;t be undone. Rows that don&apos;t match a product with a recipe are skipped.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmingDirect(false)}
                disabled={isPending}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmingDirect(false);
                  onApplyDirect();
                }}
                disabled={isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-brand-blue-dark active:scale-[.98] disabled:opacity-60"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Apply import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Import History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">No imports yet</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Download the template, fill in the day&apos;s sales, and upload it above. Applied imports
                will be listed here for your records.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">File</th>
                    <th className="px-6 py-3 font-medium">Applied</th>
                    <th className="px-6 py-3 font-medium">Skipped</th>
                    <th className="px-6 py-3 font-medium">Items sold</th>
                    <th className="px-6 py-3 font-medium">By</th>
                    <th className="px-6 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-6 py-3 text-muted-foreground">{fmtDate(log.createdAt)}</td>
                      <td className="px-6 py-3 text-foreground">{log.fileName}</td>
                      <td className="px-6 py-3 text-foreground">{log.appliedCount}</td>
                      <td className="px-6 py-3 text-muted-foreground">{log.skippedCount}</td>
                      <td className="px-6 py-3 text-foreground">{log.totalUnits}</td>
                      <td className="px-6 py-3 text-muted-foreground">{log.uploadedBy}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setViewing(log)}
                            className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </button>
                          <a
                            href={`/api/sales-import/download?id=${log.id}`}
                            className="flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Impact dialog — what a past import deducted, per product and overall */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                  <span className="truncate">{viewing.fileName}</span>
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(viewing.createdAt)} · by {viewing.uploadedBy}</p>
              </div>
              <button
                onClick={() => setViewing(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Overall */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: "Items sold", value: num(viewing.totalUnits) },
                { label: "Products", value: String(viewing.lines.length) },
                { label: "Stock lines affected", value: String(viewing.impact.length) },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Products imported */}
            <p className="mt-5 mb-2 text-sm font-medium text-foreground">Products imported</p>
            {viewing.lines.length === 0 ? (
              <p className="text-xs text-muted-foreground">No product detail was recorded for this import.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Product</th>
                      <th className="px-4 py-2 text-right font-medium">Qty sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.lines.map((l) => (
                      <tr key={`${l.product}\u0000${l.variation ?? ""}`} className="border-b last:border-0">
                        <td className="px-4 py-2 text-foreground">
                          {l.product}
                          {l.variation && (
                            <span className="text-muted-foreground"> · {l.variation}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-foreground">{num(l.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Stock deducted */}
            <p className="mt-5 mb-2 text-sm font-medium text-foreground">Stock deducted</p>
            {viewing.impact.length === 0 ? (
              <p className="text-xs text-muted-foreground">No stock deductions were recorded for this import.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-4 py-2 font-medium">Deducted</th>
                      <th className="px-4 py-2 font-medium">In stock</th>
                      <th className="px-4 py-2 font-medium">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.impact.map((i) => (
                      <tr key={i.inventoryItemId} className="border-b last:border-0">
                        <td className="px-4 py-2 text-foreground">
                          {i.name}
                          {i.insufficient && (
                            <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                              insufficient
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-foreground">−{num(i.deduct)} {i.unit}</td>
                        <td className="px-4 py-2 text-muted-foreground">{num(i.before)} {i.unit}</td>
                        <td className={cn("px-4 py-2 font-medium", i.insufficient ? "text-red-600" : "text-foreground")}>
                          {num(i.remaining)} {i.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <a
                href={`/api/sales-import/download?id=${viewing.id}`}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-brand-blue-dark"
              >
                <Download className="h-4 w-4" /> Download
              </a>
              <button
                onClick={() => setViewing(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
