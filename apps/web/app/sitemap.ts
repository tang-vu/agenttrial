import type { MetadataRoute } from "next";
import { canonicalPublicOrigin } from "../lib/site";

const routes = ["", "/benchmark", "/new", "/methodology", "/security", "/developers", "/verify"];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = canonicalPublicOrigin();
  return routes.map((route, index) => ({
    url: `${origin}${route}`,
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : route === "/benchmark" || route === "/new" ? 0.9 : 0.7,
  }));
}
