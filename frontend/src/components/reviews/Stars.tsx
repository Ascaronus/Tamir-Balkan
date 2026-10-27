import { displayRating, starFill } from "@/lib/reviews/rating"

export function Stars({ rating, count, emptyLabel, compact = false, wide = false }: { rating: number; count?: number; emptyLabel: string; compact?: boolean; wide?: boolean }) {
  const value = count === 0 ? 0 : displayRating(rating)
  return <span className={`rating${compact ? " rating-compact" : ""}${wide ? " rating-wide" : ""}`}>
    {compact && <span aria-hidden="true" className={`rating-compact-icon${value ? "" : " rating-empty"}`}><Star /></span>}
    <span aria-hidden="true" className="rating-stars">
      {[0, 1, 2, 3, 4].map(index => <span key={index} className="rating-star-slot">
        <Star className="rating-empty" />
        <span className="rating-star-fill" style={{ width: `${starFill(value, index)}%` }}>
          <Star />
        </span>
      </span>)}
    </span>
    <span>{value ? `${value}/5` : emptyLabel}</span>
  </span>
}
function Star({ className = "" }: { className?: string }) {
  return <span className={`rating-star ${className}`} />
}
export function ReviewIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3H3V6a2 2 0 0 1 2-2Z" /><path d="M7 8h10M7 12h7" /></svg>
}
export function Thumb({ down = false }: { down?: boolean }) {
  // Exact 16px exports of the Figma helpfulness icons.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/design/${down ? "downvote" : "upvote"}.svg`} width={16} height={16} alt="" aria-hidden="true" />
}
