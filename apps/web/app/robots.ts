import type { MetadataRoute } from "next";
import { canonicalPublicOrigin } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  const origin = canonicalPublicOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/live/", "/reports/"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
