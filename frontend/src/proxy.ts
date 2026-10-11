import { NextResponse, type NextRequest } from "next/server"
import { detectBrowserLocale, isLocale, LOCALE_COOKIE, locales } from "./lib/i18n/config"
import { localizedPath } from "./lib/i18n/paths"

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  // Keep the entry redirect on the public request origin behind the reverse proxy.
  // Rebuild the origin: assigning URL.host alone retains an existing internal port.
  const publicUrl = new URL(`${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`)
  publicUrl.pathname = path
  publicUrl.search = request.nextUrl.search
  const headers = new Headers(request.headers)
  // Never trust a caller-supplied routing header.
  headers.set("x-tamir-locale", path === "/en" || path.startsWith("/en/") ? "en" : "sr")
  if (path === "/") {
    const saved = request.cookies.get(LOCALE_COOKIE)?.value
    const locale = isLocale(saved) ? saved : detectBrowserLocale(request.headers.get("accept-language"), locales, "sr")
    const url = new URL(publicUrl); url.pathname = locale === "en" ? "/en" : "/rs"
    const response = NextResponse.redirect(url, 307)
    response.headers.set("Cache-Control", "private, no-store")
    response.headers.set("Vary", "Accept-Language, Cookie")
    return response
  }
  if (path.startsWith("/rs/")) {
    const canonical = localizedPath(path, "sr")
    if (canonical !== path) {
      const url = new URL(publicUrl); url.pathname = canonical
      return NextResponse.redirect(url, 308)
    }
  }
  return NextResponse.next({ request: { headers } })
}
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"] }
