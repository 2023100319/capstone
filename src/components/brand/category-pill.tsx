"use client";

import { cn } from "@/lib/utils";

export function CategoryPill({
  active,
  onClick,
  emoji,
  children,
}: {
  active: boolean;
  onClick: () => void;
  emoji?: string | null;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
          : "bg-brand-cream-dark/70 text-primary hover:bg-brand-cream-dark"
      )}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      {children}
    </button>
  );
}
