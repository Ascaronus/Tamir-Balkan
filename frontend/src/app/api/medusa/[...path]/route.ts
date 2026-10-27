import { NextResponse } from "next/server"
import {
  clearSessionCookie,
  forwardedClientIp,
  getCustomerSessionToken,
  proxyBackendUrl,
} from "@/lib/auth/session"

/**
 * Серверный прокси к Medusa Store API (H4).
 *
 * Браузер ходит только сюда, на свой же origin (`tamir.rs/api/medusa/...`), и
 * никогда не видит JWT: `httpOnly`-куку читает сервер и подставляет токен в
 * `authorization` сам. Благодаря этому кука однодоменная (не нужен кросс-доменный
 * `SameSite=None`, который открывает CSRF), а `credentials: "include"` из SDK
 * работает как обычно.
 *
 * Путь берётся из «сырого» `nextUrl.pathname` (параметры `[...path]` Next отдаёт
 * уже раскодированными — `%252e` превратился бы в `%2e`, а `%2e` в `.`), поэтому
 * срезаем префикс сами и жёстко проверяем сегменты: наружу выпускаем только
 * `/store/...`, ни `/admin`, ни `/auth`, ни `/health`, ни `..`.
 */
export const dynamic = "force-dynamic"

const PROXY_PREFIX = "/api/medusa"
/** Каталог/корзина/отзывы — JSON маленький; больше 512 КБ сюда писать некому. */
const MAX_REQUEST_BODY_BYTES = 512 * 1024
const UPSTREAM_TIMEOUT_MS = 20_000

/** Заголовки, которые клиент вправе передавать сам. `authorization` — нет. */
const FORWARDED_HEADERS = ["x-publishable-api-key", "x-medusa-locale"] as const
/** Без Control/U+7F/CRLF: значение заголовка не должно разваливать запрос к upstream. */
const SAFE_HEADER_VALUE = /^[\x20-\x7e\x80-\xff]*$/
const SAFE_PATH = /^[\x21-\x7e]*$/
const NULL_BODY_STATUS = [204, 205, 304]

function badRequest(message: string): NextResponse {
  return NextResponse.json(
    { error: "invalid_request", message },
    { status: 400, headers: { "cache-control": "no-store" } }
  )
}

/** `/api/medusa/store/products?limit=2` → `http://127.0.0.1:9000/store/products?limit=2` */
function upstreamUrl(request: Request): URL | null {
  const url = new URL(request.url)
  if (!url.pathname.startsWith(`${PROXY_PREFIX}/`)) return null
  const rest = url.pathname.slice(PROXY_PREFIX.length + 1)
  // `%2e%2e`/`%2f` до раскодирования: не даём ни `..`, ни лишнего `/` из обходных трюков.
  if (!rest || !SAFE_PATH.test(rest) || /%2e|%2f|%5c/i.test(rest) || rest.includes("\\")) return null
  const segments = rest.split("/")
  if (segments[0] !== "store") return null
  if (segments.some(segment => !segment || segment === "." || segment === "..")) return null
  const base = proxyBackendUrl()
  const target = new URL(base)
  target.pathname = `${target.pathname.replace(/\/+$/, "")}/${rest}`
  target.search = url.search
  return target
}

async function proxy(request: Request): Promise<NextResponse> {
  let target: URL
  try {
    const resolved = upstreamUrl(request)
    if (!resolved) {
      return NextResponse.json(
        { error: "not_found", message: "Only /api/medusa/store/* is proxied." },
        { status: 404, headers: { "cache-control": "no-store" } }
      )
    }
    target = resolved
  } catch {
    return badRequest("Invalid proxy target.")
  }

  const headers: Record<string, string> = {}
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name)
    if (value && SAFE_HEADER_VALUE.test(value)) headers[name] = value
  }
  // Заголовок клиента про игнорируем: единственный источник токена — httpOnly-кука.
  const token = await getCustomerSessionToken()
  if (token) headers.authorization = `Bearer ${token}`
  const clientIp = forwardedClientIp(request.headers)
  if (clientIp) headers["x-forwarded-for"] = clientIp

  const hasBody = request.method !== "GET" && request.method !== "HEAD"
  let body: ArrayBuffer | undefined
  if (hasBody) {
    const declared = Number(request.headers.get("content-length"))
    if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) {
      return NextResponse.json(
        { error: "payload_too_large", message: "Request body is too large." },
        { status: 413, headers: { "cache-control": "no-store" } }
      )
    }
    body = await request.arrayBuffer()
    if (body.byteLength > MAX_REQUEST_BODY_BYTES) {
      return NextResponse.json(
        { error: "payload_too_large", message: "Request body is too large." },
        { status: 413, headers: { "cache-control": "no-store" } }
      )
    }
    const contentType = request.headers.get("content-type")
    if (contentType && SAFE_HEADER_VALUE.test(contentType)) headers["content-type"] = contentType
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      ...(body ? { body } : {}),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    // 502, а не 401: обрыв сети не должен сбрасывать сессию покупателя.
    return NextResponse.json(
      { error: "upstream_unavailable", message: "Store API is temporarily unavailable." },
      { status: 502, headers: { "cache-control": "no-store" } }
    )
  }

  const responseHeaders = new Headers()
  const contentType = upstream.headers.get("content-type")
  if (contentType) responseHeaders.set("content-type", contentType)
  const totalCount = upstream.headers.get("x-total-count")
  if (totalCount && SAFE_HEADER_VALUE.test(totalCount)) responseHeaders.set("x-total-count", totalCount)
  responseHeaders.set("cache-control", "no-store")

  const payload = NULL_BODY_STATUS.includes(upstream.status) ? null : await upstream.arrayBuffer()
  const response = new NextResponse(payload, { status: upstream.status, headers: responseHeaders })
  // Просроченный/отозванный токен: чистим куку, чтобы интерфейс вернулся в анонимный режим.
  if (upstream.status === 401) clearSessionCookie(response)
  return response
}

export async function GET(request: Request) {
  return proxy(request)
}
export async function POST(request: Request) {
  return proxy(request)
}
export async function PUT(request: Request) {
  return proxy(request)
}
export async function PATCH(request: Request) {
  return proxy(request)
}
export async function DELETE(request: Request) {
  return proxy(request)
}
