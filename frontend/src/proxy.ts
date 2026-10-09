import { NextResponse, type NextRequest } from "next/server"
import { detectBrowserLocale, isLocale, LOCALE_COOKIE, locales } from "./lib/i18n/config"

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const headers = new Headers(request.headers)
  // Never trust a caller-supplied routing header.
  headers.set("x-tamir-locale", path === "/en" || path.startsWith("/en/") ? "en" : "sr")
  if (path === "/") {
    const saved = request.cookies.get(LOCALE_COOKIE)?.value
    const locale = isLocale(saved) ? saved : detectBrowserLocale(request.headers.get("accept-language"), locales, "sr")
    if (locale === "en") {
      const url = request.nextUrl.clone(); url.pathname = "/en"
      const response = NextResponse.redirect(url, 307)
      response.headers.set("Cache-Control", "private, no-store")
      response.headers.set("Vary", "Accept-Language, Cookie")
      return response
    }
  }
  // Reuse the Serbia market routes without ever passing "en" as an API country code.
  if (path === "/en" || /^\/en\/(catalog|products|cart|checkout|account|order)(\/|$)/.test(path) || /^\/en\/(privacy|terms|cookies)$/.test(path)) {
    const url = request.nextUrl.clone()
    url.pathname = path === "/en" ? "/" : /^\/en\/(privacy|terms|cookies)$/.test(path) ? path.slice(3) : path.replace(/^\/en/, "/rs")
    return NextResponse.rewrite(url, { request: { headers } })
  }
  return NextResponse.next({ request: { headers } })
}
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"] }
