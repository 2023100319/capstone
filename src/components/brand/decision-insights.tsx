"use client";

import { useState } from "react";
import Link from "next/link";
import { Lightbulb, ChevronRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Insight } from "@/lib/insights";
import { cn } from "@/lib/utils";

// Row accents follow the rest of the app: red is "already stopped", amber is
// "about to".
const ROW_TINT: Record<Insight["rows"][number]["tint"], string> = {
  red: "bg-red-50 text-red-700 border-red-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  muted: "bg-muted text-muted-foreground border-border",
};

/**
 * The Decision Support Insights card, shared by the Owner and Supervisor
 * dashboards. Each tile keeps its summary sentence and opens to show the rows it
 * was derived from — which ingredients, how much is left, which dishes stop
 * selling — with a link into Reorder & Alerts for the follow-up.
 *
 * Tiles open independently rather than as an accordion: in a two-column grid,
 * closing the other one just because you opened this one reads like a bug.
 */
export function DecisionInsights({
  insights,
  alertsHref,
}: {
  insights: Insight[];
  /** Role-specific — each dashboard passes its own /staff/<role>/inventory/alerts. */
  alertsHref: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">
          Decision Support Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
        {insights.map((insight) => {
          const isOpen = open[insight.key] ?? false;
          const panelId = `insight-${insight.key}`;

          return (
            <div
              key={insight.key}
              className="overflow-hidden rounded-xl border border-border bg-muted/40"
            >
              <button
                type="button"
                onClick={() => setOpen((prev) => ({ ...prev, [insight.key]: !isOpen }))}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-start gap-2 p-4 text-left transition-colors hover:bg-muted/70"
              >
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-yellow" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {insight.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{insight.body}</span>
                </span>
                <ChevronRight
                  className={cn(
                    "mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-90"
                  )}
                />
              </button>

              {isOpen && (
                <div id={panelId} className="border-t border-border bg-card">
                  {insight.rows.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">
                      {insight.emptyDetail}
                    </p>
                  ) : (
                    <div className="divide-y divide-border">
                      {insight.rows.map((row) => (
                        <div key={row.id} className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                              {row.name}
                            </span>
                            <span
                              className={cn(
                                "flex-shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                                ROW_TINT[row.tint]
                              )}
                            >
                              {row.meta}
                            </span>
                          </div>
                          {row.note && (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {row.note}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <Link
                    href={alertsHref}
                    className="flex items-center justify-end gap-1 border-t border-border px-4 py-2.5 text-xs font-medium text-brand-blue transition-colors hover:bg-muted/50"
                  >
                    View in Stock Alerts
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
