import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/seo"

export default function robots(): MetadataRoute.Robots {
  // Account and checkout layouts use noindex. Crawlers must reach the HTML to read it.
  return { rules: { userAgent: "*", allow: "/",
    disallow: ["/api/"] },
    sitemap: siteUrl("/sitemap.xml") }
}
