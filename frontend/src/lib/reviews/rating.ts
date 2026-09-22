export function displayRating(rating: number): number {
  return Math.round(Math.min(5, Math.max(0, Number.isFinite(rating) ? rating : 0)) * 10) / 10
}
export function starFill(rating: number, index: number): number {
  return Math.min(1, Math.max(0, displayRating(rating) - index)) * 100
}
export function reviewCollapsed(score: number): boolean { return score < 0 }
