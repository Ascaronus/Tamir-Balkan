export class ReviewError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
export function reviewText(value: unknown, max: number): string {
  if (typeof value !== "string") throw new ReviewError(400, "INVALID_REVIEW")
  const text = value.trim()
  if (!text || [...text].length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text)) throw new ReviewError(400, "INVALID_REVIEW")
  return text
}
export function reviewInput(input: Record<string, unknown>) {
  const name = reviewText(input.name, 60)
  // Public display names must never fall back to account emails.
  if (name.includes("@")) throw new ReviewError(400, "INVALID_NAME")
  const body = reviewText(input.body, 250)
  const rating = input.rating
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 1 || rating > 5 || !Number.isInteger(rating * 2)) throw new ReviewError(400, "RATING_REQUIRED")
  return { name, body, rating }
}
export function voteInput(value: unknown): -1 | 1 {
  if (value !== -1 && value !== 1) throw new ReviewError(400, "INVALID_VOTE")
  return value
}
export function publicReview(row: Record<string, unknown>, voted = false) {
  return { id: row.id, name: row.name, body: row.body, rating: Number(row.rating),
    score: Number(row.score || 0), up: Number(row.up || 0), down: Number(row.down || 0), created_at: row.created_at, voted }
}
export function isReviewModerator(user: { email?: string | null } | null | undefined) {
  return user?.email?.trim().toLowerCase() === "vicommsk@gmail.com"
}
