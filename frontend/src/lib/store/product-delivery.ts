import { sdk } from "@/lib/medusa"
export type DeliveryOption = { id: string; name: string; amount: number; currency_code: string }
export type ProductDelivery = { options: DeliveryOption[]; requires_checkout: boolean }

export async function getProductDelivery(productId: string): Promise<ProductDelivery | null> {
  try {
    return await sdk.client.fetch<ProductDelivery>("/store/product-delivery", {
      query: { product_id: productId }, cache: "no-store",
    })
  } catch { return null }
}
