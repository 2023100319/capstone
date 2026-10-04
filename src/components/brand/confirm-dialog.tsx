"use client";

import { Loader2, AlertTriangle } from "lucide-react";
import { DialogShell } from "./form-dialog";

/**
 * Confirmation step for destructive actions. Deleting is the one thing in the
 * management screens that cannot be undone, so it never happens on a single
 * click — and the message spells out what survives the delete.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  open,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
  error?: string;
}) {
  return (
    <DialogShell title={title} open={open} onClose={onClose}>
      <div className="p-6">
        <div className="flex gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-4.5 w-4.5" />
          </span>
          <div className="text-sm leading-relaxed text-muted-foreground">{message}</div>
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 active:scale-[.98] disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
