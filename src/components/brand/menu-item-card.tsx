"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

export type MenuCardItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice: number | null;
  isPromo: boolean;
  imageUrl: string;
  soldOut?: boolean;
  /** Ingredients that ran out. Present only for items with a recipe. */
  blockedBy?: string[];
};

export function MenuItemCard({
  item,
  onAdd,
}: {
  item: MenuCardItem;
  onAdd: () => void;
}) {
  // "Sold Out" means we ran out of the finished product; "Unavailable" means we
  // can't make any more of it — a difference the customer can act on.
  const outOfIngredients = (item.blockedBy?.length ?? 0) > 0;
  const label = outOfIngredients ? "Unavailable" : "Sold Out";

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={item.imageUrl}
          alt={item.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
          className={cn(
            "object-cover transition-transform duration-300 group-hover:scale-105",
            item.soldOut && "grayscale"
          )}
        />
        {item.soldOut ? (
          <span className="absolute top-2.5 right-2.5 rounded-full bg-neutral-800/90 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
            {label}
          </span>
        ) : (
          item.isPromo && item.originalPrice && (
            <span className="absolute top-2.5 right-2.5 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
              10% OFF
            </span>
          )
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-serif text-lg font-bold text-primary">{item.name}</h3>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {item.description}
          </p>
        )}
        {item.soldOut && outOfIngredients && (
          <p className="mt-1.5 text-xs font-medium text-red-600">
            Out of: {item.blockedBy!.join(", ")}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex items-baseline gap-2">
            {item.originalPrice && (
              <span className="text-sm text-muted-foreground line-through">
                ₱{item.originalPrice}
              </span>
            )}
            <span className="text-lg font-bold text-primary">₱{item.price}</span>
          </div>
          {item.soldOut ? (
            <span className="rounded-full bg-muted px-5 py-2 text-sm font-semibold text-muted-foreground">
              {label}
            </span>
          ) : (
            <button
              onClick={onAdd}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-brand-brown-dark hover:shadow-md active:scale-95"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
