import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Staff paste their own image URLs when adding menu items, so any HTTPS
    // host has to be renderable — not just the Unsplash links from the seed.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
