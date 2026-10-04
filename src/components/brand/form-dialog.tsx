"use client";

import { X, Loader2 } from "lucide-react";

/**
 * Backdrop, click-outside close and titled header — everything a modal in this
 * app has in common. `FormDialog` and `ConfirmDialog` both build on it.
 */
export function DialogShell({
  title,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

/** Shared modal shell for the management forms. */
export function FormDialog({
  title,
  open,
  onClose,
  onSubmit,
  submitLabel,
  submitting,
  error,
  children,
  wide = false,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting?: boolean;
  error?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <DialogShell title={title} open={open} onClose={onClose} wide={wide}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="p-6"
      >
        <div className="space-y-4">{children}</div>

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
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-brand-blue-dark active:scale-[.98] disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

/**
 * Labelled input used across the management forms. Pass `plain` when the field
 * holds more than one control or a label of its own — a <label> may not nest
 * another one, and a wrapping label would forward every stray click (caption,
 * hint) to whichever control happens to come first.
 */
export function Field({
  label,
  children,
  hint,
  plain = false,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  plain?: boolean;
}) {
  const Wrapper = plain ? "div" : "label";

  return (
    <Wrapper className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </Wrapper>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-shadow focus:outline-none focus:ring-2 focus:ring-ring/50";
