import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://racereplay.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/events/*/compare", "/api/"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
