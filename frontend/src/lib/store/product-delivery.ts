import { sdk } from "@/lib/medusa"
import { timedSignal } from "./fetch-timeout"
export type DeliveryOption = { id: string; name: string; amount: number; currency_code: string }
export type ProductDelivery = { options: DeliveryOption[]; requires_checkout: boolean }

export async function getProductDelivery(productId: string): Promise<ProductDelivery | null> {
  // Нет доставки без ответа бэкенда: дожидаемся не дольше дедлайна store-запросов.
  const t = timedSignal()
  try {
    return await sdk.client.fetch<ProductDelivery>("/store/product-delivery", {
      query: { product_id: productId }, cache: "no-store", signal: t.signal,
    })
  } catch { return null } finally { t.done() }
}
