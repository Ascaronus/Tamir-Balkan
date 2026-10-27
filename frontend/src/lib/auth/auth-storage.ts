/**
 * Устарело (H4): JWT покупателя переехал в httpOnly-куку `tb_customer_session`
 * (см. lib/auth/session.ts) и больше не хранится в браузере. Файл нужен только
 * чтобы вычистить старые токены, которые остались в localStorage у посетителей,
 * зашедших с предыдущих версий витрины.
 */
export function clearAuthToken() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem("tb_customer_token")
    window.localStorage.removeItem("medusa_auth_token")
  } catch {
    // приватный режим / отключённый storage — чистить там нечего
  }
}
