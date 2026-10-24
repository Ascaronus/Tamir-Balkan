import { NextResponse } from "next/server"
import { forwardedClientIp, isSessionToken, proxyBackendUrl, setSessionCookie } from "@/lib/auth/session"

/**
 * Вход покупателя (H4). POST `/auth/customer/emailpass` вызывает сервер, а JWT
 * кладётся в `httpOnly`-куку — в браузер он не возвращается вообще, поэтому его
 * не может украсть ни XSS, ни расширение, ни чужая вкладка.
 *
 * Здесь НЕ используется `sdk.auth.login`: js-sdk `FetchError` теряет поле `error`
 * из ответа бэкенда (`message` = `jsonError.message ?? statusText`), а LoginForm
 * и лимит попыток входа (H1, 429 + `retry_after`) живут на этом сообщении.
 * Ответ бэкенда отдаём дословно: статус + тело.
 */
export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 16 * 1024
const UPSTREAM_TIMEOUT_MS = 20_000
const EMAIL_MAX_LENGTH = 254
const PASSWORD_MAX_LENGTH = 500

function jsonError(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status, headers: { "cache-control": "no-store" } })
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return jsonError(413, "payload_too_large", "Request body is too large.")
  }
  const rawBody = await request.arrayBuffer()
  if (rawBody.byteLength > MAX_BODY_BYTES) {
    return jsonError(413, "payload_too_large", "Request body is too large.")
  }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody))
  } catch {
    return jsonError(400, "invalid_json", "Expected a JSON body.")
  }

  const email =
    typeof payload === "object" && payload !== null && typeof (payload as { email?: unknown }).email === "string"
      ? (payload as { email: string }).email.trim().toLowerCase().slice(0, EMAIL_MAX_LENGTH)
      : ""
  const password =
    typeof payload === "object" && payload !== null && typeof (payload as { password?: unknown }).password === "string"
      ? (payload as { password: string }).password.slice(0, PASSWORD_MAX_LENGTH)
      : ""
  if (!email || !password) {
    return jsonError(400, "invalid_request", "Email and password are required.")
  }

  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" }
  // Лимитчик Medusa (H1) считает попытки по ip/почте: без корректного
  // x-forwarded-for все покупатели делили бы одну квоту на 127.0.0.1.
  const clientIp = forwardedClientIp(request.headers)
  if (clientIp) headers["x-forwarded-for"] = clientIp

  let upstream: Response
  try {
    upstream = await fetch(`${proxyBackendUrl()}/auth/customer/emailpass`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    return jsonError(502, "upstream_unavailable", "Auth service is temporarily unavailable.")
  }

  const body = await upstream.text()
  if (!upstream.ok) {
    const contentType = upstream.headers.get("content-type")
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        ...(contentType ? { "content-type": contentType } : { "content-type": "application/json" }),
        "cache-control": "no-store",
      },
    })
  }

  let data: unknown
  try {
    data = JSON.parse(body)
  } catch {
    return jsonError(502, "unexpected_auth_response", "Auth service returned an unreadable response.")
  }
  const token =
    typeof data === "object" && data !== null
      ? ((data as { token?: unknown }).token ?? (data as { access_token?: unknown }).access_token)
      : undefined

  if (!isSessionToken(token)) {
    // Сообщений бэкенда не касаемся: его тело (message/error) уже в ответе ниже.
    const message =
      typeof data === "object" && data !== null && typeof (data as { message?: unknown }).message === "string"
        ? (data as { message: string }).message
        : "Login failed."
    return jsonError(401, "login_failed", message)
  }

  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } })
  setSessionCookie(response, token)
  return response
}
