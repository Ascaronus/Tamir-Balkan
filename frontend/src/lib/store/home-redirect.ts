import { headers } from "next/headers"
import { geoCountryToCatalogPath, getGeoCountryFromHeaders } from "@/lib/geo/geo-country"
import { listRegions } from "@/lib/store/regions"

const ALLOWED = new Set(["rs", "me"])

/**
 * Куда вести с главной `/`.
 * С гео (по умолчанию): страна из заголовков прокси → RS/ME → каталог; иначе выбор региона.
 * Без гео (`NEXT_PUBLIC_USE_GEO_REGION=false`): как раньше — env или выбор.
 */
export async function getHomeRedirectPath(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_SHOW_REGION_PICKER === "true") {
    return null
  }

  const geoEnabled = process.env.NEXT_PUBLIC_USE_GEO_REGION !== "false"
  if (geoEnabled) {
    const h = await headers()
    const country = getGeoCountryFromHeaders(h)
    const geoPath = geoCountryToCatalogPath(country)
    if (geoPath) return geoPath
    return null
  }

  const explicitPath = process.env.NEXT_PUBLIC_DEFAULT_CATALOG_PATH?.trim()
  if (explicitPath?.startsWith("/")) {
    return explicitPath
  }

  const iso = process.env.NEXT_PUBLIC_DEFAULT_REGION_ISO2?.toLowerCase().trim()
  if (iso && ALLOWED.has(iso)) {
    return `/${iso}/catalog`
  }

  const regionId = process.env.NEXT_PUBLIC_DEFAULT_REGION_ID?.trim()
  if (regionId) {
    const regions = await listRegions()
    const match = regions.find((r) => r.id === regionId)
    const cc = match?.countries?.[0]?.iso_2?.toLowerCase()
    if (cc && ALLOWED.has(cc)) {
      return `/${cc}/catalog`
    }
  }

  return null
}
