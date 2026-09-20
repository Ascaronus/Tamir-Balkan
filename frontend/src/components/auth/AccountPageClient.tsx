"use client"

import Link from "next/link"
import { OrderHistoryDetails } from "./OrderHistoryDetails"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { applyReorder, reorderTargets } from "@/lib/cart/reorder"
import { useAuth } from "@/components/auth/AuthProvider"
import { sdk } from "@/lib/medusa"
import { getAuthToken } from "@/lib/auth/auth-storage"
import { useCart } from "@/components/cart/CartProvider"
import { AccountProfileForm } from "@/components/auth/AccountProfileForm"
import { useTranslations } from "@/components/i18n/LocaleProvider"

function authHeaders() {
  const token = getAuthToken()
  return token ? { authorization: `Bearer ${token}` } : undefined
}

export function AccountPageClient({ countryCode }: { countryCode: string }) {
  const t = useTranslations()
  const router = useRouter()
  const { addItem, refresh: refreshCart, isMutating } = useCart()
  const { customer, isReady, logout } = useAuth()
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [repeating, setRepeating] = useState(false)
  const repeatLock = useRef(false)
  const plans = useRef(new Map<string, { cartId: string; targets: Record<string, number> }>())
  const [repeatError, setRepeatError] = useState<string | null>(null)
  const [orders, setOrders] = useState<HttpTypes.StoreOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady) return
    if (!customer) return
    let cancelled = false
    ;(async () => {
      setLoadingOrders(true)
      setError(null)
      try {
        // Список заказов клиента — отдельный маршрут (на /customers/me нельзя запросить orders.items).
        const res = await sdk.client.fetch<{
          orders: HttpTypes.StoreOrder[]
        }>("/store/orders", {
          method: "GET",
          headers: authHeaders(),
          query: { limit: 50, offset, order: "-created_at" },
          cache: "no-store",
        })
        const nextOrders = res.orders ?? []
        if (!cancelled) {
          setOrders(nextOrders)
          setHasMore(nextOrders.length === 50)
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("account.loadOrdersFailed"))
      } finally {
        if (!cancelled) setLoadingOrders(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isReady, customer, t, offset])

  if (!isReady) {
    return (
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6 text-sm text-[var(--store-text-muted)]">
        {t("account.loading")}
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
        <h1 className="text-xl font-semibold text-[var(--store-text)]">
          {t("account.title")}
        </h1>
        <p className="mt-2 text-sm text-[var(--store-text-muted)]">
          {t("account.notLoggedIn")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/${countryCode}/account/login`}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--store-text)] px-6 text-sm font-semibold text-white"
          >
            {t("account.login")}
          </Link>
          <Link
            href={`/${countryCode}/account/register`}
            className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--store-border)] px-6 text-sm font-semibold text-[var(--store-text)]"
          >
            {t("account.createAccount")}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--store-text)]">
              {customer.first_name} {customer.last_name}
            </h1>
            <div className="mt-1 text-sm text-[var(--store-text-muted)]">
              {customer.email} {customer.phone ? `· ${customer.phone}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await logout()
              router.push(`/${countryCode}/catalog`)
            }}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--store-border)] px-5 text-sm font-semibold text-[var(--store-text)]"
          >
            {t("account.logout")}
          </button>
        </div>
      </div>

      <AccountProfileForm key={customer.id} countryCode={countryCode} />

      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
        <h2 className="text-lg font-semibold text-[var(--store-text)]">
          {t("account.orders")}
        </h2>
        {repeatError && <p role="alert" className="mt-3 text-red-700">{repeatError}</p>}
        <div className="mt-3 flex gap-3">
          <button type="button" disabled={loadingOrders || offset === 0} onClick={() => setOffset(n => Math.max(0, n - 50))} className="rounded border px-3 py-2 disabled:opacity-40">{t("common.previous")}</button>
          <button type="button" disabled={loadingOrders || !hasMore} onClick={() => setOffset(n => n + 50)} className="rounded border px-3 py-2 disabled:opacity-40">{t("common.next")}</button>
        </div>
        {loadingOrders ? (
          <div className="mt-3 text-sm text-[var(--store-text-muted)]">
            {t("account.loadingOrders")}
          </div>
        ) : error ? (
          <div className="mt-3 text-sm text-red-700">{error}</div>
        ) : orders.length ? (
          <ul className="mt-4 divide-y divide-[var(--store-border)]">
            {orders.map((o) => (
              <li key={customer.id + ":" + o.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--store-text)]">
                      {t("account.orderLabel", {
                        id: String(o.display_id ?? o.id),
                      })}
                    </div>
                    <div className="mt-1 text-sm text-[var(--store-text-muted)]">
                      {o.created_at ? new Date(o.created_at).toLocaleString() : ""}
                    </div>
                  </div>
                  <button
                    disabled={isMutating || repeating}
                    type="button"
                    onClick={async () => {
                      if (repeatLock.current) return
                      repeatLock.current = true
                      setRepeating(true)
                      try {
                        setRepeatError(null)
                        const { order } = await sdk.client.fetch<{
                          order: { items?: { variant_id?: string; quantity: number }[] }
                        }>(`/store/orders/${o.id}`, {
                          method: "GET",
                          headers: authHeaders(),
                          cache: "no-store",
                        })
                        const items = order?.items ?? []
                        const current = await refreshCart()
                        const planKey = customer.id + ":" + o.id
                        let plan = plans.current.get(planKey)
                        if (!plan || plan.cartId !== current.id) {
                          plan = { cartId: current.id, targets: reorderTargets(current.items ?? [], items) }
                          plans.current.set(planKey, plan)
                        }
                        const cartId = plan.cartId
                        await applyReorder(plan.targets, {
                          items: async () => {
                            const next = await refreshCart()
                            if (next.id !== cartId) throw new Error("Cart changed")
                            return next.items ?? []
                          }, add: addItem,
                        })
                        router.push(`/${countryCode}/cart`)
                      } catch (e: unknown) {
                        setRepeatError(t("account.repeatPartial"))
                      } finally {
                        repeatLock.current = false
                        setRepeating(false)
                      }
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--store-text)] px-5 text-sm font-semibold text-white"
                  >
                    {t("account.repeatOrder")}
                  </button>
                </div>
                <OrderHistoryDetails order={o} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 text-sm text-[var(--store-text-muted)]">
            {t("account.noOrders")}
          </div>
        )}
      </div>
    </div>
  )
}

