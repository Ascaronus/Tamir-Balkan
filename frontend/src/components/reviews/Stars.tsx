import { displayRating, starFill } from "@/lib/reviews/rating"

export function Stars({ rating, count, emptyLabel }: { rating: number; count?: number; emptyLabel: string }) {
  const value = count === 0 ? 0 : displayRating(rating)
  return <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-[var(--store-text-muted)]">
    <span aria-hidden="true" className="inline-flex gap-0.5">
      {[0, 1, 2, 3, 4].map(index => <span key={index} className="relative inline-block h-3.5 w-3.5">
        <Star className="absolute inset-0 h-full w-full text-stone-200" />
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${starFill(value, index)}%` }}>
          <Star className="h-3.5 w-3.5 max-w-none text-[var(--store-text-muted)]" />
        </span>
      </span>)}
    </span>
    <span>{value ? `${value}/5` : emptyLabel}</span>
  </span>
}
function Star({ className }: { className: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="m12 2.5 2.93 5.94 6.56.95-4.75 4.63 1.12 6.54L12 17.47l-5.86 3.09 1.12-6.54L2.51 9.39l6.56-.95Z" /></svg>
}
export function ReviewIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3H3V6a2 2 0 0 1 2-2Z" /><path d="M7 8h10M7 12h7" /></svg>
}
export function Thumb({ down = false }: { down?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={`h-4 w-4 ${down ? "rotate-180" : ""}`}><path strokeLinejoin="round" d="M8 10 12 3c3 0 2 4 1 6h6c2 0 2 2 1 5l-2 6H8V10ZM3 10h5v10H3z" /></svg>
}
