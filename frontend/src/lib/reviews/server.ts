import { sdk } from "@/lib/medusa"
import type { Summary, ReviewList } from "./client"
export async function reviewSummaries(ids: string[]): Promise<Record<string, Summary> | null> {
  if (!ids.length) return {}
  try {
    const result = await sdk.client.fetch<{ summaries: Record<string, Summary> }>("/store/reviews/summary", {
      query: { product_ids: ids.join(",") }, cache: "no-store",
    })
    return result.summaries
  } catch { return null }
}

/** Public data only: do not forward customer cookies or authorization. */
export async function productReviews(productId: string): Promise<ReviewList | null> {
  try {
    return await sdk.client.fetch<ReviewList>("/store/reviews", {
      query: { product_id: productId, offset: 0 }, cache: "no-store", signal: AbortSignal.timeout(5000),
    })
  } catch { return null }
}
