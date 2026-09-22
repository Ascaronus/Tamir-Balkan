import { sdk } from "@/lib/medusa"
import { getAuthToken } from "@/lib/auth/auth-storage"
export type Review = { id: string; name: string; body: string; rating: number; score: number; up: number; down: number; created_at: string; voted: boolean }
export type ReviewList = { reviews: Review[]; count: number; rating: number; has_review: boolean }
export type Summary = { count: number; rating: number }
export async function reviewRequest<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const token = getAuthToken()
  return sdk.client.fetch<T>(path, { method: body ? "POST" : "GET", cache: "no-store",
    headers: token ? { authorization: `Bearer ${token}` } : {}, ...(body ? { body } : {}) })
}
export function listReviews(productId: string, offset = 0) {
  return reviewRequest<ReviewList>(`/store/reviews?product_id=${encodeURIComponent(productId)}&offset=${offset}`)
}
export function reviewErrorKey(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.includes("CAPTCHA_CANCELLED")) return ""
  if (message.includes("CAPTCHA")) return "reviews.captchaFailed"
  if (message.includes("ALREADY_SUBMITTED")) return "reviews.alreadyReviewed"
  if (message.includes("INVALID_NAME") || message.includes("INVALID_REVIEW")) return "reviews.invalid"
  if (message.includes("LOGIN_REQUIRED") || (error as { status?: number })?.status === 401) return "reviews.loginRequired"
  if (message.includes("TOO_MANY_REQUESTS")) return "reviews.tooMany"
  return "reviews.failed"
}
