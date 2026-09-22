import { sdk } from "@/lib/medusa"
import type { Summary } from "./client"
export async function reviewSummaries(ids: string[]): Promise<Record<string, Summary> | null> {
  if (!ids.length) return {}
  try {
    const result = await sdk.client.fetch<{ summaries: Record<string, Summary> }>("/store/reviews/summary", {
      query: { product_ids: ids.join(",") }, cache: "no-store",
    })
    return result.summaries
  } catch { return null }
}
