"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";

const LINKS = [
  { href: "/menu", label: "Menu" },
  { href: "#locations", label: "Locations" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-brand-espresso/[0.06] bg-brand-cream-warm/90 backdrop-blur-md backdrop-saturate-150">
      <div className="relative mx-auto flex max-w-[1440px] items-center justify-between px-5 py-[18px] md:px-14">
        <Link href="/" className="flex items-center gap-3">
          <BrandLogo variant="customer" size={40} />
          <span className="font-serif text-[22px] font-bold tracking-[0.01em] text-brand-espresso">
            Ericahlicious
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-[34px] text-[15px] lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="text-[#5c4a3b] transition-colors hover:text-brand-gold"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/menu"
            className="rounded-full bg-brand-coffee px-[22px] py-[11px] font-medium text-brand-cream-warm transition-colors hover:bg-brand-brown-dark"
          >
            Order now
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="p-2 text-[#5c4a3b] lg:hidden"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        {/* Mobile menu */}
        {open && (
          <nav className="absolute inset-x-0 top-full flex flex-col items-start gap-[18px] border-b border-brand-espresso/[0.08] bg-brand-cream-warm px-5 py-6 text-[15px] lg:hidden">
            {LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-[#5c4a3b] transition-colors hover:text-brand-gold"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/menu"
              onClick={() => setOpen(false)}
              className="rounded-full bg-brand-coffee px-[22px] py-[11px] font-medium text-brand-cream-warm transition-colors hover:bg-brand-brown-dark"
            >
              Order now
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
