import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Staff area, the sign-in screen (/staff exactly, which the trailing-slash
      // entry does not cover), the old per-role sign-in URLs that redirect to
      // it, and the API aren't for search engines.
      disallow: ["/staff", "/staff/", "/api/", "/supervisor", "/admin", "/owner"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
