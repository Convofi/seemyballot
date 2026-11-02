import type { MetadataRoute } from "next";

// A single "*" group covers all crawlers, AI crawlers included.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: "https://seemyballot.com/sitemap.xml",
  };
}
