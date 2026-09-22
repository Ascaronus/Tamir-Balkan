"use client"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/components/auth/AuthProvider"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { useCaptcha } from "@/components/security/Captcha"
import { listReviews, reviewRequest, reviewErrorKey, type Review, type ReviewList, type Summary } from "@/lib/reviews/client"
import { reviewCollapsed } from "@/lib/reviews/rating"
import { Stars, ReviewIcon, Thumb } from "./Stars"

export function ProductReviews({ productId, initial }: { productId: string; initial: Summary | null }) {
  const { t, locale } = useLocaleContext()
  const { customer, isReady } = useAuth()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<ReviewList | null>(null)
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
    if (open && isReady) void load()
    return () => { generation.current++ }
  }, [open, isReady, customer?.id, load])
  return <section id="reviews" className="mt-10 scroll-mt-6 border-t border-[var(--store-border)] pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ReviewIcon />
        {summary ? <><Stars rating={summary.rating} count={summary.count} emptyLabel={t("reviews.noRatings")} /><span className="text-xs text-[var(--store-text-muted)]">· {t("reviews.count", { n: summary.count })}</span></> : <span className="text-sm">{t("reviews.title")}</span>}
      </div>
      <button type="button" aria-expanded={open} aria-controls="product-review-content" className="min-h-10 text-sm underline underline-offset-4" onClick={() => setOpen(v => !v)}>{t(open ? "reviews.collapse" : "reviews.show")}</button>
    </div>
    {open && <div id="product-review-content" className="review-reveal mt-4">
      {error && <p role="alert" className="my-3 text-sm text-red-700">{t(error)} <button className="underline" type="button" onClick={() => void load()}>{t("reviews.retry")}</button></p>}
      {notice && <p role="status" className="my-3 text-sm">{t(notice)}</p>}
      {loading && <p role="status" className="py-3 text-sm">{t("reviews.loading")}</p>}
      {data?.reviews.length === 0 && !loading && <p className="py-3 text-sm text-[var(--store-text-muted)]">{t("reviews.empty")}</p>}
      <div className="divide-y divide-[var(--store-border)]">
        {data?.reviews.map(review => <ReviewItem key={review.id + ":" + (customer?.id || "guest")} review={review} signedIn={Boolean(customer)} locale={locale} onVoted={updated => setData(old => old ? { ...old, reviews: old.reviews.map(r => r.id === review.id ? { ...r, ...updated } : r) } : old)} />)}
      </div>
      {data && data.reviews.length < data.count && <button type="button" disabled={loading} className="my-3 rounded-full border px-4 py-2 text-sm disabled:opacity-50" onClick={() => void load(data.reviews.length)}>{t("reviews.more")}</button>}
      {isReady && !customer ? <p className="mt-4 text-sm"><Link href="/rs/account/login" className="underline">{t("reviews.signIn")}</Link> {t("reviews.signInHint")}</p> : customer && data?.has_review ? <p className="mt-4 text-sm text-[var(--store-text-muted)]">{t("reviews.alreadyReviewed")}</p> : customer && data && <form className="mt-5 max-w-xl border-t border-[var(--store-border)] pt-5" onSubmit={async e => {
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
          <label className="mt-3 block text-sm">{t("reviews.text")}<textarea required value={body} onChange={e => setBody([...e.target.value].slice(0, 250).join(""))} rows={3} className="mt-1 block w-full resize-y rounded-xl border border-[var(--store-border)] p-3 text-sm" /></label>
          <div className="mt-1 text-right text-xs text-[var(--store-text-muted)]" aria-live="polite">{[...body].length}/250</div>
          <button type="submit" className="mt-2 min-h-10 rounded-full bg-[var(--store-text)] px-5 text-sm font-medium text-white disabled:opacity-50">{t(busy ? "reviews.sending" : "reviews.submit")}</button>
        </fieldset>
      </form>}
      <button type="button" className="mt-4 text-xs underline" onClick={() => { setOpen(false); document.getElementById("reviews")?.scrollIntoView({ block: "start" }) }}>{t("reviews.collapse")}</button>
    </div>}
    {captcha}
  </section>
}
function ReviewItem({ review, signedIn, locale, onVoted }: { review: Review; signedIn: boolean; locale: string; onVoted: (value: Partial<Review>) => void }) {
  const { t } = useLocaleContext()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)
  const negative = reviewCollapsed(review.score)
  const collapsed = negative && !expanded
  async function vote(value: number) {
    if (lock.current || review.voted || !signedIn) return
    lock.current = true; setBusy(true); setError("")
    try {
      const next = await reviewRequest<Partial<Review>>(`/store/reviews/${encodeURIComponent(review.id)}/vote`, { value })
      if ((next.score ?? 0) < 0) setExpanded(false)
      onVoted(next)
    } catch (err) { setError(reviewErrorKey(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <article className="flex gap-3 py-4 sm:gap-4">
    <div className="flex w-9 shrink-0 flex-col items-center gap-1 text-xs text-[var(--store-text-muted)]" aria-label={t("reviews.helpfulness")}>
      <button type="button" disabled={!signedIn || review.voted || busy} title={t(!signedIn ? "reviews.loginRequired" : review.voted ? "reviews.voted" : "reviews.helpful")} aria-label={t("reviews.helpful")} className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--store-border)] disabled:opacity-40" onClick={() => void vote(1)}><Thumb /></button>
      <span className="font-medium tabular-nums" aria-live="polite">{review.score > 0 ? "+" : ""}{review.score}</span>
      <button type="button" disabled={!signedIn || review.voted || busy} title={t(!signedIn ? "reviews.loginRequired" : review.voted ? "reviews.voted" : "reviews.unhelpful")} aria-label={t("reviews.unhelpful")} className="flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--store-border)] disabled:opacity-40" onClick={() => void vote(-1)}><Thumb down /></button>
    </div>
    <div className="min-w-0 flex-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-medium break-words">{review.name}</span><Stars rating={review.rating} emptyLabel={t("reviews.noRatings")} /><time className="text-xs text-[var(--store-text-muted)]" dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString(locale === "sr" ? "sr-Latn-RS" : "en-GB")}</time></div>
      {collapsed ? <div className="mt-2 text-xs text-[var(--store-text-muted)]"><p>{t("reviews.hiddenNegative", { n: review.score })}</p><button type="button" className="mt-1 min-h-8 underline" aria-expanded={false} onClick={() => setExpanded(true)}>{t("reviews.expandOne")}</button></div> : <><p className="review-reveal mt-2 whitespace-pre-wrap break-words leading-relaxed">{review.body}</p>{negative && <button type="button" className="mt-1 text-xs underline" aria-expanded={true} onClick={() => setExpanded(false)}>{t("reviews.collapseOne")}</button>}</>}
      <div className="mt-2 flex items-center gap-3 text-xs text-[var(--store-text-muted)]"><span className="inline-flex items-center gap-1" aria-label={`${t("reviews.helpful")}: ${review.up}`}><Thumb /> {review.up}</span><span className="inline-flex items-center gap-1" aria-label={`${t("reviews.unhelpful")}: ${review.down}`}><Thumb down /> {review.down}</span>{review.voted && <span>{t("reviews.voted")}</span>}</div>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{t(error)}</p>}
    </div>
  </article>
}
