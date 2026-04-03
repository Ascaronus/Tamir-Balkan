import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const locale =
    typeof body === "object" &&
    body !== null &&
    "locale" in body &&
    typeof (body as { locale: unknown }).locale === "string"
      ? (body as { locale: string }).locale
      : null
  if (!isLocale(locale)) {
    return NextResponse.json({ error: "invalid_locale" }, { status: 400 })
  }
  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
    httpOnly: false,
  })
  return NextResponse.json({ ok: true })
}
