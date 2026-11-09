import type { MetadataRoute } from "next"
import { blocksSearchEngines, siteUrl } from "@/lib/seo"

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Staging answers with the same code as production; anything that is not a public
  // production host must never publish a sitemap. Crawling stays allowed on purpose:
  // Google only drops an indexed URL when it can read noindex, and a Disallow rule
  // would hide the X-Robots-Tag from the crawler. Tighten robots.txt only after the
  // staging URLs are gone from the index.
  if (await blocksSearchEngines()) {
    return { rules: { userAgent: "*", allow: "/" } }
  }
  // Account and checkout layouts use noindex. Crawlers must reach the HTML to read it.
  return { rules: { userAgent: "*", allow: "/",
    disallow: ["/api/"] },
    sitemap: siteUrl("/sitemap.xml") }
}
