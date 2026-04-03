/**
 * ISO 3166-1 alpha-2 из заголовков, которые прокси/CDN часто добавляют к запросу.
 * Локально заголовков обычно нет — вернётся null → покажем выбор региона.
 */
const HEADER_CANDIDATES = [
  "x-vercel-ip-country",
  "cf-ipcountry",
  "cloudfront-viewer-country",
  "x-country-code",
  "x-geo-country",
  "x-appengine-country",
] as const

const STORE_COUNTRIES = new Set(["rs", "me"])

export function normalizeCountryCode(raw: string | null | undefined): string | null {
  if (!raw || raw === "XX" || raw === "T1") return null
  const t = raw.trim().toUpperCase()
  if (t.length !== 2) return null
  return t
}

export function getGeoCountryFromHeaders(headers: Headers): string | null {
  for (const name of HEADER_CANDIDATES) {
    const v = headers.get(name)
    const code = normalizeCountryCode(v)
    if (code) return code
  }
  return null
}

/** RS → /rs/catalog, ME → /me/catalog, иначе null */
export function geoCountryToCatalogPath(countryIso2: string | null): string | null {
  if (!countryIso2) return null
  const lower = countryIso2.toLowerCase()
  if (STORE_COUNTRIES.has(lower)) return `/${lower}/catalog`
  return null
}
