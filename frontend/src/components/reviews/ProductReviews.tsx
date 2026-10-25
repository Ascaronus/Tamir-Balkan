"use client"
import Link from "@/components/i18n/LocalizedLink"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { useCaptcha } from "@/components/security/Captcha"
import { listReviews, reviewRequest, reviewErrorKey, type Review, type ReviewList, type Summary } from "@/lib/reviews/client"
import { reviewCollapsed } from "@/lib/reviews/rating"
import { Stars, Thumb } from "./Stars"

export function ProductReviews({ productId, initial, initialReviews = null }: { productId: string; initial: Summary | null; initialReviews?: ReviewList | null }) {
  const { t, locale } = useLocaleContext()
  const { customer, isReady } = useAuth()
  const [open, setOpen] = useState(true)
  const [data, setData] = useState<ReviewList | null>(initialReviews)
  const [summary, setSummary] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [body, setBody] = useState("")
  const [rating, setRating] = useState(0)
  const [busy, setBusy] = useState(false)
  const submitLock = useRef(false)
  const generation = useRef(0)
  const { requestCaptcha, captcha } = useCaptcha("review")
  const load = useCallback(async (offset = 0) => {
    const current = ++generation.current
    setLoading(true)
    setError("")
    try {
      const next = await listReviews(productId, offset)
      if (current !== generation.current) return
      setData(old => ({ ...next, reviews: offset && old ? [...old.reviews, ...next.reviews.filter(r => !old.reviews.some(p => p.id === r.id))] : next.reviews }))
      setSummary({ count: next.count, rating: next.rating })
    } catch (e) { if (current === generation.current) setError(reviewErrorKey(e)) }
    finally { if (current === generation.current) setLoading(false) }
  }, [productId])
  useEffect(() => {
    const reveal = () => { if (window.location.hash === "#reviews") setOpen(true) }
    reveal()
    window.addEventListener("hashchange", reveal)
    return () => window.removeEventListener("hashchange", reveal)
  }, [])
  useEffect(() => {
    if (isReady) void load()
    return () => { generation.current++ }
  }, [isReady, customer?.id, load])
  return <section id="reviews" className="reviews-layout mt-12 scroll-mt-6 border-t border-[var(--store-border)] pt-8">
    <div className="reviews-intro"><h2>{t("design.reviewIntro")}</h2><p>{t("design.reviewHint")}</p><Link href={customer ? "#review-write" : "/rs/account/login"} className="button-secondary" onClick={() => setOpen(true)}>{t("reviews.write")}</Link></div>
    <div className="reviews-main">
      <div className="review-section-heading"><h2>{t("reviews.title")}{summary ? ` (${summary.count})` : ""}</h2><button type="button" aria-expanded={open} aria-controls="product-review-content" className="button-quiet" onClick={() => setOpen(v => !v)}>{t(open ? "reviews.collapse" : "reviews.show")}</button></div>
      {summary && <div className="review-summary"><Stars rating={summary.rating} count={summary.count} emptyLabel={t("reviews.noRatings")} wide />{summary.count > 0 && <span>· {t("reviews.count", { n: summary.count })}</span>}</div>}
      <p className="review-caption">{t("reviews.experiences")}</p>
    <div hidden={!open} id="product-review-content" className="review-reveal mt-4">
      {error && <p role="alert" className="my-3 text-sm text-red-700">{t(error)} <button className="underline" type="button" onClick={() => void load()}>{t("reviews.retry")}</button></p>}
      {notice && <p role="status" className="my-3 text-sm">{t(notice)}</p>}
      {loading && <p role="status" className="py-3 text-sm">{t("reviews.loading")}</p>}
      {data?.reviews.length === 0 && !loading && <p className="py-3 text-sm text-[var(--store-text-muted)]">{t("reviews.empty")}</p>}
      <div className="space-y-4">
        {data?.reviews.map(review => <ReviewItem key={review.id + ":" + (customer?.id || "guest")} review={review} signedIn={Boolean(customer)} locale={locale} onVoted={updated => setData(old => old ? { ...old, reviews: old.reviews.map(r => r.id === review.id ? { ...r, ...updated } : r) } : old)} />)}
      </div>
      {data && data.reviews.length < data.count && <button type="button" disabled={loading} className="my-3 rounded border px-4 py-2 text-sm disabled:opacity-50" onClick={() => void load(data.reviews.length)}>{t("reviews.more")}</button>}
      <div id="review-write" className="scroll-mt-6">{isReady && !customer ? <p className="mt-4 text-sm"><Link href="/rs/account/login" className="underline">{t("reviews.signIn")}</Link> {t("reviews.signInHint")}</p> : customer && data?.has_review ? <p className="mt-4 text-sm text-[var(--store-text-muted)]">{t("reviews.alreadyReviewed")}</p> : customer && data && <form className="mt-5 max-w-xl border-t border-[var(--store-border)] pt-5" onSubmit={async e => {
        e.preventDefault()
        if (submitLock.current) return
        setError(""); setNotice("")
        if (!rating || !body.trim() || [...body.trim()].length > 250 || !customer.first_name?.trim() || customer.first_name.includes("@")) { setError("reviews.invalid"); return }
        submitLock.current = true; setBusy(true)
        try {
          const captcha_token = await requestCaptcha()
          await reviewRequest("/store/reviews", { product_id: productId, body: body.trim(), rating, captcha_token })
          setBody(""); setRating(0); setNotice("reviews.sent")
          setData(old => old ? { ...old, has_review: true } : old)
          await load()
        } catch (err) { setError(reviewErrorKey(err)) }
        finally { submitLock.current = false; setBusy(false) }
      }}>
        <h3 className="text-sm font-medium">{t("reviews.write")}</h3>
        <p className="mt-2 text-xs text-[var(--store-text-muted)]">{t("reviews.publishedAs")} {customer.first_name?.includes("@") ? "" : customer.first_name} · <Link href="/rs/account" className="underline">{t("reviews.profile")}</Link></p>
        <fieldset disabled={busy} className="mt-3">
          <legend className="text-sm">{t("reviews.rating")}</legend>
          <div className="mt-1 flex flex-wrap gap-1">
            {[1, 2, 3, 4, 5].map(value => <label key={value} className={`relative flex min-h-10 cursor-pointer items-center gap-1 rounded-lg border px-2.5 text-sm ${rating === value ? "border-[var(--store-text)] bg-[var(--store-bg-muted)]" : "border-[var(--store-border)]"}`}>
              <input type="radio" name="review-rating" value={value} required checked={rating === value} onChange={() => setRating(value)} className="accent-stone-700" /><span aria-hidden="true">★</span> {value}
            </label>)}
          </div>
          <label className="mt-3 block text-sm">{t("reviews.text")}<textarea required value={body} onChange={e => setBody([...e.target.value].slice(0, 250).join(""))} rows={3} className="mt-1 block w-full resize-y rounded border border-[var(--store-border)] p-3 text-sm" /></label>
          <div className="mt-1 text-right text-xs text-[var(--store-text-muted)]" aria-live="polite">{[...body].length}/250</div>
          <button type="submit" className="mt-2 min-h-10 rounded bg-[var(--store-accent)] hover:bg-[var(--store-accent-hover)] px-5 text-sm font-medium text-white disabled:opacity-50">{t(busy ? "reviews.sending" : "reviews.submit")}</button>
        </fieldset>
      </form>}
      </div>
      <button type="button" className="button-quiet mt-4 w-full" onClick={() => { setOpen(false); document.getElementById("reviews")?.scrollIntoView({ block: "start" }) }}>{t("reviews.collapse")}</button>
    </div>
    </div>
    {captcha}
  </section>
}
function ReviewItem({ review, signedIn, locale, onVoted }: { review: Review; signedIn: boolean; locale: string; onVoted: (value: Partial<Review>) => void }) {
  const { t } = useLocaleContext()
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)
  const negative = reviewCollapsed(review.score)
  const collapsed = !(expanded ?? !negative)
  async function vote(value: number) {
    if (lock.current || review.voted || !signedIn) return
    lock.current = true; setBusy(true); setError("")
    try {
      const next = await reviewRequest<Partial<Review>>(`/store/reviews/${encodeURIComponent(review.id)}/vote`, { value })
      onVoted(next)
    } catch (err) { setError(reviewErrorKey(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <article className="review-card">
    <div className="review-author"><span className="font-medium break-words">{review.name}</span><Stars rating={review.rating} emptyLabel={t("reviews.noRatings")} /></div>
    <time className="review-caption" dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString(locale === "sr" ? "sr-Latn-RS" : "en-GB", { timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit" })}</time>
    {collapsed && negative && <p className="review-caption">{t("reviews.hiddenNegative", { n: review.score })}</p>}
    <div id={`review-body-${review.id}`} hidden={collapsed} className="review-reveal">
      <p className="review-body whitespace-pre-wrap break-words">{review.body}</p>
      <div className="review-actions" aria-label={t("reviews.helpfulness")}>
        {([1, -1] as const).map(value => {
          const label = t(value === 1 ? "reviews.helpful" : "reviews.unhelpful")
          const count = value === 1 ? review.up : review.down
          const content = <><Thumb down={value === -1} /><span>{count}</span></>
          return signedIn ? <button key={value} type="button" disabled={review.voted || busy} title={t(review.voted ? "reviews.voted" : value === 1 ? "reviews.helpful" : "reviews.unhelpful")} aria-label={`${label}: ${count}`} onClick={() => void vote(value)}>{content}</button> : <Link key={value} href="/rs/account/login" title={t("reviews.loginRequired")} aria-label={`${label}: ${count}. ${t("reviews.loginRequired")}`}>{content}</Link>
        })}
        <span className="tabular-nums" aria-live="polite">{review.score > 0 ? "+" : ""}{review.score}</span>
        {review.voted && <span>{t("reviews.voted")}</span>}
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{t(error)}</p>}
    <button type="button" className="button-quiet w-full" aria-expanded={!collapsed} aria-controls={`review-body-${review.id}`} onClick={() => setExpanded(collapsed)}>{t(collapsed ? "reviews.expandOne" : "reviews.collapseOne")}</button>
  </article>
}
