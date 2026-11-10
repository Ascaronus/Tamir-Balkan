import { NextResponse, type NextRequest } from "next/server"
import { localizedPath } from "./lib/i18n/paths"
import { hostBlocksSearchEngines, ROBOTS_NOINDEX_TAG } from "./lib/seo"

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  // Keep the entry redirect on the public request origin behind the reverse proxy.
  // Rebuild the origin: assigning URL.host alone retains an existing internal port.
  const publicHost = request.headers.get("host") || request.nextUrl.host
  const publicUrl = new URL(`${request.nextUrl.protocol}//${publicHost}`)
  publicUrl.pathname = path
  publicUrl.search = request.nextUrl.search
  const headers = new Headers(request.headers)
  // Never trust a caller-supplied routing header.
  headers.set("x-tamir-locale", path === "/en" || path.startsWith("/en/") ? "en" : "sr")
  // Only production hosts may be indexed; every other host is closed at the response level.
  const noindex = hostBlocksSearchEngines(publicHost, request.nextUrl.protocol)
  if (path === "/") {
    // A single permanent destination reinforces /rs as the Serbian canonical.
    // English remains available through /en and the language switcher.
    const url = new URL(publicUrl); url.pathname = "/rs"
    const response = NextResponse.redirect(url, 308)
    response.headers.set("Cache-Control", "private, no-store")
    if (noindex) response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX_TAG)
    return response
  }
  if (path.startsWith("/rs/")) {
    const canonical = localizedPath(path, "sr")
    if (canonical !== path) {
      const url = new URL(publicUrl); url.pathname = canonical
      const response = NextResponse.redirect(url, 308)
      if (noindex) response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX_TAG)
      return response
    }
  }
  const response = NextResponse.next({ request: { headers } })
  if (noindex) response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX_TAG)
  return response
}
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"] }
