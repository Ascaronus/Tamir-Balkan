import Medusa from "@medusajs/js-sdk"

/** Fetch/Headers требуют ASCII; кириллица в URL из .env даёт ByteString error при сборке. */
function assertAsciiUrl(label: string, value: string): string {
  const v = value.trim()
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i)
    if (c > 0x7f) {
      throw new Error(
        `${label} must be ASCII only (Latin URL). Non-ASCII at index ${i} (U+${c.toString(16)}). Retype the value in .env — no Cyrillic lookalikes.`
      )
    }
  }
  return v
}

const MEDUSA_BACKEND_URL = assertAsciiUrl(
  "NEXT_PUBLIC_MEDUSA_BACKEND_URL",
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"
)

/**
 * Аутентификация покупателя (H4) — тип "session": js-sdk сам не хранит и не
 * подставляет JWT (в браузере токена больше нет), но шлёт `credentials:
 * "include"`, поэтому httpOnly-кука `tb_customer_session` приходит на наш
 * прокси `/api/medusa/*`, а сервер уже подставляет `authorization: Bearer`.
 *
 * Из браузера SDK ходит на свой же origin (путь `/api/medusa`): SDK собирает URL
 * как `new URL(baseUrl.pathname + path, baseUrl.origin)`, поэтому запрос
 * `/store/products` уходит в `/api/medusa/store/products`. На сервере (SSR и
 * сборка) окна нет, и анонимные серверные запросы идут в бэкенд напрямую, как раньше.
 */
export const sdk = new Medusa({
  baseUrl: typeof window === "undefined"
    ? MEDUSA_BACKEND_URL
    : `${window.location.origin}/api/medusa`,
  debug: process.env.NODE_ENV === "development",
  auth: { type: "session" },
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})
