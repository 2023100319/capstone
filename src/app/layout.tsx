import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { AuthSessionProvider } from "@/components/session-provider";
import { CartProvider } from "@/lib/cart-store";
import { ourFileRouter } from "@/app/api/uploadthing/core";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ericahlicious Food Inc. — Brew & Bake",
    template: "%s · Ericahlicious",
  },
  description:
    "Ericahlicious Brew & Bake — freshly brewed coffee and small-batch baked goods in Malolos, Bulacan. Order ahead and it's warm on the counter when you arrive.",
  applicationName: "Ericahlicious",
  keywords: [
    "Ericahlicious",
    "Brew and Bake",
    "coffee shop Malolos",
    "cafe Bulacan",
    "fresh coffee",
    "pastries",
    "order coffee online",
    "Filipino cafe",
  ],
  authors: [{ name: "Ericahlicious Food Inc." }],
  openGraph: {
    type: "website",
    locale: "en_PH",
    siteName: "Ericahlicious",
    title: "Ericahlicious Food Inc. — Brew & Bake",
    description:
      "Freshly brewed coffee and small-batch baked goods in Malolos, Bulacan. Order ahead — warm on the counter when you arrive.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ericahlicious Food Inc. — Brew & Bake",
    description:
      "Freshly brewed coffee and small-batch baked goods in Malolos, Bulacan.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <NextSSRPlugin routerConfig={extractRouterConfig(ourFileRouter)} />
        <AuthSessionProvider>
          <CartProvider>{children}</CartProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
