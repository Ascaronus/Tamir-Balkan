import type { NextResponse } from "next/server"
import { cookies } from "next/headers"

/**
 * Сессия покупателя (H4). JWT больше не попадает в браузер: он живёт только
 * в httpOnly-куке, а прокси `/api/medusa/*` подставляет его в заголовок
 * `authorization` уже на сервере. XSS-инъекция поэтому не может украсть токен.
 *
 * CSRF закрывает `sameSite: "lax"`: кросс-доменный POST с чужого сайта куку не
 * передаёт, а `Content-Type: application/json` (который требует Medusa) нельзя
 * отправить простой html-формой.
 */
export const CUSTOMER_SESSION_COOKIE = "tb_customer_session"

/** Долговременные JWT из Medusa не должны превращаться в «вечную» куку. */
const MAX_SESSION_AGE_SECONDS = 30 * 24 * 60 * 60
/** Если в токене нет читаемого `exp`, держим куку сутки. */
const DEFAULT_SESSION_AGE_SECONDS = 24 * 60 * 60

/**
 * Значение куки идёт в заголовок `authorization`. Разрешаем только символы JWT
 * (base64url + точки) — так значение не может разобрать заголовок на два
 * (CRLF-инъекция) и не улетает в upstream мусор.
 */
const TOKEN_VALUE_RE = /^[A-Za-z0-9\-_.=]+$/
const MAX_TOKEN_LENGTH = 8192

export function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TOKEN_LENGTH && TOKEN_VALUE_RE.test(value)
}

/** `exp` из payload'а JWT (base64url), чтобы кука жила ровно столько, сколько токен. */
export function sessionMaxAgeSeconds(token: string): number {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return DEFAULT_SESSION_AGE_SECONDS
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: unknown }
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return DEFAULT_SESSION_AGE_SECONDS
    const seconds = Math.floor(payload.exp - Date.now() / 1000)
    if (seconds <= 0) return 0
    return Math.min(seconds, MAX_SESSION_AGE_SECONDS)
  } catch {
    return DEFAULT_SESSION_AGE_SECONDS
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Прод живёт на https (tamir.rs), локальная разработка — на http://localhost.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  if (!isSessionToken(token)) return
  response.cookies.set(CUSTOMER_SESSION_COOKIE, token, cookieOptions(sessionMaxAgeSeconds(token)))
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(CUSTOMER_SESSION_COOKIE, "", cookieOptions(0))
}

/** Токен текущей сессии (серверный код). `null`, если куки нет или она испорчена. */
export async function getCustomerSessionToken(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(CUSTOMER_SESSION_COOKIE)?.value ?? null
  return isSessionToken(value) ? value : null
}

const IP_RE = /^[0-9a-fA-F:.]{1,45}$/

function isLoopback(value: string): boolean {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1" || value.startsWith("127.")
}

/**
 * Ограничитель попыток входа (H1) считает клиента по `x-forwarded-for`: правый
 * элемент цепочки — адрес, который дописал nginx, его подделать нельзя. Всё, что
 * налево, пишет сам браузер, поэтому берём только последний элемент и отдаём его
 * ОДНИМ значением. Если nginx не дописывает `x-forwarded-for` (`$remote_addr`
 * вместо `$proxy_add_x_forwarded_for`), поданное значение поддельно — поэтому
 * кривые/петлевые адреса отбрасываем, а не выдумываем.
 */
export function forwardedClientIp(headers: Headers): string | null {
  const header = headers.get("x-forwarded-for")
  if (!header) return null
  const chain = header.split(",")
  const rightmost = (chain[chain.length - 1] ?? "").trim()
  if (!IP_RE.test(rightmost) || isLoopback(rightmost)) return null
  return rightmost
}

/**
 * Куда прокси ходит на сервере. Отдельная переменная нужна потому, что
 * `NEXT_PUBLIC_MEDUSA_BACKEND_URL` участвует в `images.remotePatterns`
 * (next.config.ts) и должна оставаться публичным origin`api.tamir.rs`, а
 * серверная нога в прод-конфиге — это `http://127.0.0.1:9000`, иначе nginx
 * `api.tamir.rs` допишет в `x-forwarded-for` адрес VPS и все покупатели попадут
 * в одну корзину лимита попыток входа.
 */
export function proxyBackendUrl(): string {
  const raw = (process.env.MEDUSA_PROXY_BACKEND_URL || process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000").trim()
  if (!/^[\x21-\x7e]+$/.test(raw)) {
    throw new Error("MEDUSA_PROXY_BACKEND_URL must be ASCII only (Latin URL), no spaces or Cyrillic lookalikes.")
  }
  const url = new URL(raw)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("MEDUSA_PROXY_BACKEND_URL must be an http(s) URL.")
  }
  return raw.replace(/\/+$/, "")
}
