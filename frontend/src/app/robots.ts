import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/seo"

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/",
    disallow: ["/api/", "/rs/account", "/rs/cart", "/rs/checkout", "/rs/order", "/rs/login", "/rs/register"] },
    sitemap: siteUrl("/sitemap.xml") }
}
