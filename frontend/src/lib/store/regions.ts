import { sdk } from "@/lib/medusa"
import { timedSignal } from "./fetch-timeout"
import type { HttpTypes } from "@medusajs/types"

export async function listRegions(): Promise<HttpTypes.StoreRegion[]> {
  const t = timedSignal()
  try {
    const { regions } = await sdk.client.fetch<{ regions: HttpTypes.StoreRegion[] }>(
      `/store/regions`,
      {
        method: "GET",
        // Без кэша, чтобы новые регионы/страны из админки сразу отражались.
        cache: "no-store",
        signal: t.signal,
      }
    )

    return regions
  } finally {
    t.done()
  }
}

export async function getRegionByCountry(
  countryCode: string
): Promise<HttpTypes.StoreRegion | null> {
  if (countryCode.toLowerCase() !== "rs") return null
  const regions = await listRegions()

  const match = regions.find((r) =>
    r.countries?.some((c) => c.iso_2?.toLowerCase() === countryCode)
  )

  return match ?? null
}

