"use client"

import { useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { sdk } from "@/lib/medusa"
import { getAuthToken } from "@/lib/auth/auth-storage"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { formatMoney } from "@/lib/format-money"

export function OrderHistoryDetails({ order }: { order: HttpTypes.StoreOrder }) {
  const { t, locale } = useLocaleContext()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<HttpTypes.StoreOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const money = (value: number | null | undefined) =>
    formatMoney(value, order.currency_code, locale === "sr" ? "sr-Latn-RS" : "en-GB")
  const status = (value: string | undefined) =>
    t("account.statuses." + (value && ["pending", "completed", "canceled", "archived", "requires_action", "not_fulfilled", "partially_fulfilled", "fulfilled", "partially_shipped", "shipped", "partially_delivered", "delivered"].includes(value) ? value : "unknown"))

  async function load() {
    setLoading(true)
    setFailed(false)
    try {
      const token = getAuthToken()
      if (!token) throw new Error("Authentication required")
      // The list endpoint enforces ownership via the authenticated customer ID.
      const result = await sdk.client.fetch<{ orders: HttpTypes.StoreOrder[] }>("/store/orders", {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
        query: {
          id: order.id, limit: 1,
          fields: "id,display_id,status,currency_code,total,subtotal,shipping_total,tax_total,discount_total,*items",
        },
        cache: "no-store",
      })
      const found = result.orders.find(item => item.id === order.id)
      if (!found) throw new Error("Order unavailable")
      setDetail(found)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <strong>{t("account.orderTotal")}: {money(order.total)}</strong>
        <span>{t("account.orderStatus")}: {status(order.status)}</span>
        <span>{t("account.shippingStatus")}: {status(order.fulfillment_status)}</span>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`details-${order.id}`}
        className="mt-3 rounded-full border border-[var(--store-border)] px-5 py-2 text-sm font-semibold"
        onClick={() => {
          setOpen(!open)
          if (!open && !detail && !loading) void load()
        }}
      >
        {t(open ? "account.hideDetails" : "account.viewDetails")}
      </button>
      {open && (
        <div id={`details-${order.id}`} className="mt-4 rounded-xl bg-[var(--store-bg-muted)] p-4">
          {loading && <p role="status">{t("account.loading")}</p>}
          {failed && <div role="alert"><p>{t("account.loadOrdersFailed")}</p><button type="button" onClick={() => void load()} disabled={loading} className="mt-2 underline">{t("common.retry")}</button></div>}
          {detail && <>
            <ul className="divide-y divide-[var(--store-border)]">
              {(detail.items ?? []).map(item => item && (
                <li key={item.id} className="py-3">
                  <p className="font-semibold">{item.product_title || item.title}</p>
                  {item.variant_title && <p className="text-sm">{t("account.variant")}: {item.variant_title}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span>{t("account.quantity")}: {item.quantity}</span>
                    <span>{t("account.unitPrice")}: {money(item.unit_price)}</span>
                    <strong>{t("account.lineTotal")}: {money(item.total)}</strong>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--store-border)] pt-4 text-sm">
              <dt>{t("account.subtotal")}</dt><dd className="text-right">{money(detail.subtotal)}</dd>
              <dt>{t("account.discount")}</dt><dd className="text-right">{money(detail.discount_total)}</dd>
              <dt>{t("account.shipping")}</dt><dd className="text-right">{money(detail.shipping_total)}</dd>
              <dt>{t("account.tax")}</dt><dd className="text-right">{money(detail.tax_total)}</dd>
              <dt className="font-semibold">{t("account.orderTotal")}</dt><dd className="text-right font-semibold">{money(detail.total)}</dd>
            </dl>
          </>}
        </div>
      )}
    </div>
  )
}
