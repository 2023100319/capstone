import Link from "next/link";
import { ChevronLeft, ShoppingCart } from "lucide-react";

export function CustomerHeader({
  title,
  backHref,
  cartCount,
  showCart = false,
  children,
}: {
  title: string;
  backHref?: string;
  cartCount?: number;
  showCart?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-primary/10 bg-brand-cream/90 backdrop-blur-md">
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-2 sm:px-6 lg:px-8">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {backHref && (
              <Link
                href={backHref}
                aria-label="Go back"
                className="-ml-2 rounded-full p-2 text-primary transition-colors hover:bg-primary/10"
              >
                <ChevronLeft className="h-6 w-6" />
              </Link>
            )}
            <h1 className="font-serif text-2xl font-bold text-primary sm:text-3xl">
              {title}
            </h1>
          </div>
          {showCart && (
            <Link
              href="/cart"
              aria-label="View cart"
              className="relative rounded-full p-2 text-primary transition-colors hover:bg-primary/10"
            >
              <ShoppingCart className="h-6 w-6" />
              {(cartCount ?? 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-sm">
                  {cartCount}
                </span>
              )}
            </Link>
          )}
        </div>
        {children}
      </div>
    </header>
  );
}
