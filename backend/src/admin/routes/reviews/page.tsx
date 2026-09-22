import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useCallback, useEffect, useState } from "react"

type Review = { id: string; product_title: string; product_id: string; name: string; author_name: string; author_email: string; body: string; rating: number; version: number; status: string; up: number; down: number; created_at: string; updated_at: string }
async function request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  // The existing Medusa Admin uses an authenticated HTTP-only session.
  const res = await fetch(path, { credentials: "include", method: body ? "POST" : "GET", cache: "no-store",
    headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (!res.ok) {
    if (res.status === 403 || res.status === 401) throw Error("Only admin@tamir.local can moderate reviews. / Samo admin@tamir.local može moderirati recenzije.")
    if (res.status === 409) throw Error("This review changed. Refresh and try again. / Recenzija je izmenjena. Osvežite prikaz.")
    throw Error("Unable to load or save reviews. / Učitavanje ili čuvanje nije uspelo.")
  }
  return res.json()
}
export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [count, setCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const load = useCallback(async () => {
    const result = await request<{ reviews: Review[]; count: number }>(`/admin/reviews?offset=${offset}`)
    setReviews(result.reviews); setCount(result.count)
  }, [offset])
  useEffect(() => { let cancelled = false; request<{ reviews: Review[]; count: number }>(`/admin/reviews?offset=${offset}`).then(r => { if (!cancelled) { setReviews(r.reviews); setCount(r.count); setError("") } }).catch(e => { if (!cancelled) { setReviews([]); setCount(0); setError(e.message) } }); return () => { cancelled = true } }, [offset, refresh])
  async function save(review: Review, changes: Record<string, unknown>) {
    setBusy(true); setError("")
    try { await request(`/admin/reviews/${encodeURIComponent(review.id)}`, { ...changes, version: review.version }); await load() }
    catch (e) { setError(e instanceof Error ? e.message : "Failed") }
    finally { setBusy(false) }
  }
  return <div style={{ padding: 24, maxWidth: 1100 }}>
    <h1 style={{ fontSize: 22, fontWeight: 600 }}>Reviews / Recenzije</h1>
    <p style={{ margin: "8px 0 16px", color: "#666" }}>Only published reviews count towards product ratings. / Samo objavljene recenzije ulaze u ocenu proizvoda.</p>
    {error && <p role="alert" style={{ color: "#a11", margin: "12px 0" }}>{error}</p>}
    <button onClick={() => setRefresh(v => v + 1)}>Refresh / Osveži</button>
    {reviews.map(review => <article key={review.id + ":" + review.version} style={{ borderTop: "1px solid #ddd", padding: "18px 0" }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><strong>{review.product_title || review.product_id}</strong><span>{review.rating}/5</span><span>{review.status}</span><span>👍 {review.up} · 👎 {review.down}</span></div>
      <p style={{ margin: "8px 0" }}>{review.author_name || review.name} · {review.author_email} · {new Date(review.created_at).toLocaleString()}</p>
      <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void save(review, { name: data.get("name"), body: data.get("body") }) }}>
        <label>Public name / Javno ime<input name="name" defaultValue={review.name} required maxLength={60} pattern="[^@]+" style={{ display: "block", border: "1px solid #ddd", padding: 8, borderRadius: 6, width: "100%", maxWidth: 500 }} /></label>
        <label>Text / Tekst<textarea name="body" defaultValue={review.body} required maxLength={250} rows={3} style={{ display: "block", border: "1px solid #ddd", padding: 8, borderRadius: 6, width: "100%", margin: "8px 0" }} /></label>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <button disabled={busy} type="submit">Save text / Sačuvaj tekst</button>
          {review.status === "published" && <button disabled={busy} type="button" onClick={() => void save(review, { status: "hidden" })}>Hide / Sakrij</button>}
          {review.status !== "published" && <button disabled={busy} type="button" onClick={() => void save(review, { status: "published" })}>Restore / Vrati</button>}
          {review.status !== "deleted" && <button disabled={busy} type="button" style={{ color: "#a11" }} onClick={() => { if (window.confirm("Remove this review from the store? / Ukloniti ovu recenziju iz prodavnice?")) void save(review, { status: "deleted" }) }}>Delete / Obriši</button>}
        </div>
      </form>
    </article>)}
    <div style={{ display: "flex", gap: 24, marginTop: 20 }}><button disabled={offset === 0 || busy} onClick={() => setOffset(v => Math.max(0, v - 30))}>← Previous / Prethodno</button><span>{Math.min(offset + 1, count)}–{Math.min(offset + 30, count)} / {count}</span><button disabled={offset + 30 >= count || busy} onClick={() => setOffset(v => v + 30)}>Next / Sledeće →</button></div>
  </div>
}
export const config = defineRouteConfig({ label: "Reviews / Recenzije" })
