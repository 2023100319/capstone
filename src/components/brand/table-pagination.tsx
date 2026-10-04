"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The footer under a client-side paginated table: a row count on the left, page
 * buttons on the right.
 *
 * Menu Health and Menu Availability both receive every row with the page and
 * slice locally rather than doing a `?page=` round trip the way the Activity
 * feed does, so they share the footer instead of each growing its own copy of
 * the window-with-gaps maths.
 */

/**
 * Clamp `page` to the rows that actually exist and cut out the visible slice.
 *
 * Narrowing a filter can strand the reader past the last page, so the clamp
 * happens on read — otherwise every filter handler would have to remember to
 * reset the page.
 */
export function paginate<T>(rows: T[], page: number, perPage: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * perPage;
  return { page: current, pageCount, start, visible: rows.slice(start, start + perPage) };
}

export function TablePagination({
  page,
  pageCount,
  start,
  shown,
  total,
  filteredFrom,
  onPageChange,
  className,
}: {
  /** The clamped page — pass `paginate()`'s `page`, not the raw state. */
  page: number;
  pageCount: number;
  /** Zero-based index of the first visible row. */
  start: number;
  /** How many rows are on screen right now. */
  shown: number;
  /** Rows left after filtering. */
  total: number;
  /** Rows before filtering; the "(filtered from N)" note only shows if it differs. */
  filteredFrom: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (total === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-3 px-6 pb-5", className)}
    >
      <p className="text-xs text-muted-foreground">
        Showing {start + 1}&ndash;{start + shown} of {total}
        {filteredFrom !== total && ` (filtered from ${filteredFrom})`}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <PageButton onClick={() => onPageChange(page - 1)} disabled={page === 1} label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </PageButton>
          {pageWindow(page, pageCount).map((p, index) =>
            p === null ? (
              <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  "min-w-9 rounded-lg px-3 py-1.5 text-center text-sm font-medium transition-colors",
                  p === page
                    ? "bg-brand-navy text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {p}
              </button>
            )
          )}
          <PageButton
            onClick={() => onPageChange(page + 1)}
            disabled={page === pageCount}
            label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </PageButton>
        </div>
      )}
    </div>
  );
}

function PageButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:text-muted-foreground/40"
    >
      {children}
    </button>
  );
}

/** Up to 7 slots: first, last, the pages around the current one, `null` for gaps. */
function pageWindow(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const pages = new Set([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const out: (number | null)[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) out.push(null);
    out.push(p);
    previous = p;
  }
  return out;
}
