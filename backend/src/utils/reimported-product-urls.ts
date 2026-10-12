import type { Knex } from "knex"

/** The UA and default supplier pages identify the same model, including its color. */
export function supplierProductUrls(metadata: Record<string, unknown> | null): string[] {
  const values = [metadata?.rozetka_product_key, metadata?.rozetka_url].filter(Boolean)
  if (!values.length) return []
  const paths = new Set<string>()
  for (const value of values) {
    if (typeof value !== "string") return []
    let url: URL
    try { url = new URL(value) } catch { return [] }
    if (url.protocol !== "https:" || !["tamir.ua", "www.tamir.ua"].includes(url.hostname)
      || url.port || url.username || url.password || url.search || url.hash) return []
    const path = url.pathname.replace(/^\/ua\//, "/").replace(/\/$/, "")
    if (!path.endsWith(".html")) return []
    paths.add(path)
  }
  if (paths.size !== 1) return []
  const path = [...paths][0]
  return ["tamir.ua", "www.tamir.ua"].flatMap(host => ["", "/ua"].flatMap(locale =>
    ["", "/"].map(suffix => `https://${host}${locale}${path}${suffix}`)))
}

/** Read-only recovery from Medusa soft-deleted products. Never infer identity from a title. */
export async function resolveReimportedProductHandle(db: Knex, handle: string): Promise<string | null> {
  // A live product owns its names, even when it is not published or in this sales channel.
  const owner = await db("product").whereNull("deleted_at").where(q => q.where({ handle })
    .orWhereRaw("metadata->>'rozetka_legacy_handle' = ?", [handle])
    .orWhereIn("id", db("tamir_product_url").select("product_id").where({ handle }))).first("id")
  if (owner) return null
  const retired = await db("product").select("metadata").whereNotNull("deleted_at")
    .where(q => q.where({ handle }).orWhereRaw("metadata->>'rozetka_legacy_handle' = ?", [handle])
      .orWhereIn("id", db("tamir_product_url").select("product_id").where({ handle })))
  if (!retired.length) return null
  const identities = retired.map(row => supplierProductUrls(row.metadata))
  if (identities.some(urls => !urls.length) || new Set(identities.map(urls => urls[0])).size !== 1) return null
  const urls = identities[0]
  const candidates = await db("product").select("handle", "metadata").whereNull("deleted_at")
    .where(q => q.whereRaw("metadata->>'rozetka_product_key' = ANY(?::text[])", [urls])
      .orWhereRaw("metadata->>'rozetka_url' = ANY(?::text[])", [urls])).select("status")
  // Duplicate live imports are ambiguous, including a published/draft pair.
  if (candidates.length !== 1 || candidates[0].status !== "published") return null
  const candidate = candidates[0]
  return supplierProductUrls(candidate.metadata)[0] === urls[0] ? candidate.handle : null
}
