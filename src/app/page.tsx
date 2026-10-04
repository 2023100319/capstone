import Link from "next/link";
import Image from "next/image";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { BrandLogo } from "@/components/brand/brand-logo";
import { LandingNav } from "@/components/brand/landing-nav";
import { getMenuItems } from "@/app/actions/menu";
import { menuAvailability } from "@/lib/availability";
import { CONTACT, LOCATIONS, mapsUrl } from "@/lib/locations";
import heroImage from "@/../public/hero-cafe.png";

export const dynamic = "force-dynamic";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

type FeaturedItem = { id: string; name: string; price: number; imageUrl: string };

/** Up to three items for the "Today's counter" strip — recommended first. */
async function getFeatured(): Promise<FeaturedItem[]> {
  try {
    const items = await getMenuItems();
    const ranked = [...items].sort((a, b) => {
      // Orderable first, then recommended. "Orderable" follows the same rule as
      // the menu: ingredients for recipe items, product count for the rest.
      const stock =
        Number(!menuAvailability(b).unavailable) - Number(!menuAvailability(a).unavailable);
      if (stock !== 0) return stock;
      return Number(b.isRecommended) - Number(a.isRecommended);
    });
    return ranked.slice(0, 6).map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl ?? "",
    }));
  } catch {
    // DB may be unreachable in some dev environments — degrade gracefully.
    return [];
  }
}

const WRAP = "mx-auto w-full max-w-[1440px] px-5 md:px-14";

export default async function LandingPage() {
  const featured = await getFeatured();

  return (
    <div
      className={`${cormorant.variable} ${jost.variable} min-h-screen bg-brand-cream-warm font-sans text-[#5c4a3b]`}
      style={
        {
          "--font-serif": "var(--font-cormorant)",
          "--font-sans": "var(--font-jost)",
        } as React.CSSProperties
      }
    >
      <LandingNav />

      <main>
        {/* Hero */}
        <section id="order" className="bg-brand-cream-warm">
          <div
            className={`${WRAP} grid grid-cols-1 items-center gap-6 py-8 lg:min-h-[calc(100vh-77px)] lg:grid-cols-2 lg:gap-[72px] lg:py-10`}
          >
            {/* Image — first on mobile (top), right column on desktop */}
            <div className="relative order-first aspect-[4/3] overflow-hidden rounded-[18px] lg:order-last lg:shadow-[0_30px_50px_-24px_rgba(59,36,23,0.5)]">
              <Image
                src={heroImage}
                alt="Latte and fresh pastries on a wooden table"
                fill
                preload
                placeholder="blur"
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              {/* Bottom fade into the cream background on mobile */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-b from-transparent to-brand-cream-warm lg:hidden" />
            </div>

            <div>
              <p className="mb-3 text-[13px] uppercase tracking-[0.26em] text-brand-gold lg:mb-6">
                <span className="hidden lg:inline">Brew &amp; Bake · est. daily</span>
                <span className="lg:hidden">Brew &amp; Bake</span>
              </p>
              <h1 className="mb-4 font-serif text-[clamp(44px,9vw,76px)] font-semibold leading-none text-brand-espresso lg:mb-[26px] lg:text-[clamp(44px,5.2vw,76px)]">
                <span className="hidden lg:inline">
                  Coffee &amp; pastries, made fresh this morning.
                </span>
                <span className="lg:hidden">
                  Fresh coffee &amp; pastries, made this morning.
                </span>
              </h1>
              <p className="mb-6 max-w-[460px] text-[19px] font-light leading-relaxed text-[#6e5a49] lg:mb-10">
                <span className="hidden lg:inline">
                  Slow-brewed espresso and small-batch bakes. Order ahead and it&apos;s
                  warm on the counter when you arrive.
                </span>
                <span className="lg:hidden">
                  Order ahead — warm on the counter when you arrive.
                </span>
              </p>
              {/* One CTA. There used to be a "View the menu" outline button beside
                  this, but both pointed at /menu, so it was a second way to say the
                  same thing. Without `sm:flex-1` the lone button hugs its width on
                  desktop instead of spanning the column; it still fills the row on
                  mobile, where the container is flex-col. */}
              <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3.5">
                <Link
                  href="/menu"
                  className="rounded-full bg-brand-coffee px-7 py-3.5 text-center text-base font-medium text-brand-cream-warm transition-colors hover:bg-brand-brown-dark sm:min-w-[200px]"
                >
                  Start ordering
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Today's counter */}
        <section id="menu" className="bg-brand-cream-2 pt-16 pb-20">
          <div className={WRAP}>
            <div className="mb-7 flex items-baseline justify-between">
              <h2 className="font-serif text-[26px] font-semibold text-brand-espresso lg:text-[30px]">
                Today&apos;s counter
              </h2>
              <Link href="/menu" className="text-sm text-brand-gold hover:text-brand-gold">
                See full menu →
              </Link>
            </div>

            {featured.length > 0 && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((item) => (
                  <Link
                    key={item.id}
                    href="/menu"
                    className="overflow-hidden rounded-[14px] bg-white transition-shadow hover:shadow-lg"
                  >
                    <div
                      className="h-[180px] bg-brand-cream-2 bg-cover bg-center md:h-[150px]"
                      style={
                        item.imageUrl
                          ? { backgroundImage: `url(${item.imageUrl})` }
                          : undefined
                      }
                    />
                    <div className="flex items-center justify-between px-[18px] py-4">
                      <span className="font-serif text-[19px] font-semibold text-brand-espresso">
                        {item.name}
                      </span>
                      <span className="font-medium text-brand-gold">₱{item.price}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-brand-espresso py-12 text-[#e7d3bf]">
        <div className={`${WRAP} flex flex-wrap justify-between gap-12`}>
          <div className="max-w-[300px]">
            <Link href="/" className="flex items-center gap-3">
              <BrandLogo variant="customer" size={40} />
              <span className="font-serif text-[22px] font-bold text-brand-cream-warm">
                Ericahlicious
              </span>
            </Link>
            <p className="mt-3.5 text-sm font-light leading-relaxed text-[#b49b84]">
              Brew &amp; Bake, open daily across {LOCATIONS.length} branches in Bulacan
              and Valenzuela. Order ahead and pick it up at whichever one is nearest.
            </p>
          </div>

          <div className="flex flex-wrap gap-14">
            <div className="flex flex-col gap-2.5 text-sm">
              <span className="mb-0.5 text-[11px] uppercase tracking-[0.16em] text-[#8c755f]">
                Explore
              </span>
              <Link href="/menu" className="text-[#e7d3bf] hover:text-brand-gold">
                Menu
              </Link>
              <Link href="#locations" className="text-[#e7d3bf] hover:text-brand-gold">
                Locations
              </Link>
            </div>
            <div className="flex flex-col gap-2.5 text-sm">
              <span className="mb-0.5 text-[11px] uppercase tracking-[0.16em] text-[#8c755f]">
                Contact
              </span>
              <a href={CONTACT.phoneHref} className="text-[#e7d3bf] hover:text-brand-gold">
                {CONTACT.phone}
              </a>
              <a
                href={CONTACT.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#e7d3bf] hover:text-brand-gold"
              >
                Facebook
              </a>
            </div>
          </div>
        </div>

        {/* Every branch — the nav's "Locations" link lands here. */}
        <div id="locations" className={`${WRAP} mt-12 border-t border-white/10 pt-10`}>
          <h2 className="mb-6 text-[11px] uppercase tracking-[0.16em] text-[#8c755f]">
            Our locations
          </h2>
          <ul className="grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {LOCATIONS.map((location) => (
              <li key={location.name}>
                <p className="font-serif text-[19px] font-semibold text-brand-cream-warm">
                  {location.name}
                </p>
                <a
                  href={mapsUrl(location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 block text-sm text-[#e7d3bf] hover:text-brand-gold"
                >
                  {location.address}
                </a>
                {location.landmark && (
                  <p className="mt-0.5 text-[13px] text-[#b49b84]">{location.landmark}</p>
                )}
                <p className="mt-1 text-[13px] text-[#b49b84]">{location.hours}</p>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}
