"use client"
import { useEffect, useState } from "react"
import { sdk } from "@/lib/medusa"
import { getAuthToken } from "@/lib/auth/auth-storage"
import { readReceipt, type OrderReceipt } from "@/lib/checkout/receipt"
import { useTranslations } from "@/components/i18n/LocaleProvider"

export function OrderConfirmation({ id }: { id: string }) {
  const t = useTranslations()
  const [order, setOrder] = useState<OrderReceipt | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      setOrder(null)
      const receipt = readReceipt(id)
      if (receipt) { if (!cancelled) setOrder(receipt); return }
      const token = getAuthToken()
      if (!token) return
      // The authenticated list endpoint scopes results to the current customer.
      const result = await sdk.client.fetch<{ orders: OrderReceipt[] }>("/store/orders", {
        method: "GET", query: { id, limit: 1 }, headers: { authorization: `Bearer ${token}` }, cache: "no-store",
      })
      if (!cancelled) setOrder(result.orders.find(order => order.id === id) ?? null)
    })().catch(() => undefined).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, attempt])
  if (loading) return <p>{t("account.loading")}</p>
  if (!order) return <div role="alert"><h1>{t("order.unverified")}</h1><p>{t("order.unverifiedHint")}</p><button type="button" className="mt-4 rounded border px-4 py-2" onClick={() => setAttempt(n => n + 1)}>{t("common.retry")}</button></div>
  return <div><h1 className="text-xl font-semibold">{t("order.confirmed")}</h1><p className="mt-2">{t("order.orderId")} {order.display_id ?? order.id}</p></div>
}
