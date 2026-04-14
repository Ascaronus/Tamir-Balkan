"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import type { HttpTypes } from "@medusajs/types"
import { useAuth } from "@/components/auth/AuthProvider"
import { sdk } from "@/lib/medusa"
import { getAuthToken } from "@/lib/auth/auth-storage"
import { addToCart } from "@/lib/cart/cart-client"
import { AccountProfileForm } from "@/components/auth/AccountProfileForm"
import { useTranslations } from "@/components/i18n/LocaleProvider"

function authHeaders() {
  const token = getAuthToken()
  return token ? ({ authorization: `Bearer ${token}` } as any) : (undefined as any)
}

export function AccountPageClient({ countryCode }: { countryCode: string }) {
  const t = useTranslations()
  const router = useRouter()
  const { customer, isReady, logout } = useAuth()
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
        // Try to retrieve customer with orders
        const res = await sdk.client.fetch<{ customer: any }>(
          "/store/customers/me",
          {
            method: "GET",
            headers: authHeaders(),
            query: {
              fields:
                "+orders.*,+orders.items.*,+orders.items.variant_id,+orders.items.quantity",
            } as Record<string, string>,
            cache: "no-store",
          }
        )
        const nextOrders = (res.customer?.orders ?? []) as HttpTypes.StoreOrder[]
        if (!cancelled) setOrders(nextOrders)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || t("account.loadOrdersFailed"))
      } finally {
        if (!cancelled) setLoadingOrders(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isReady, customer])

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

      <AccountProfileForm countryCode={countryCode} />

      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
        <h2 className="text-lg font-semibold text-[var(--store-text)]">
          {t("account.orders")}
        </h2>
        {loadingOrders ? (
          <div className="mt-3 text-sm text-[var(--store-text-muted)]">
            {t("account.loadingOrders")}
          </div>
        ) : error ? (
          <div className="mt-3 text-sm text-red-700">{error}</div>
        ) : orders.length ? (
          <ul className="mt-4 divide-y divide-[var(--store-border)]">
            {orders.map((o: any) => (
              <li key={o.id} className="py-4">
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
                    type="button"
                    onClick={async () => {
                      try {
                        setError(null)
                        const items = (o.items ?? []) as any[]
                        for (const it of items) {
                          if (it?.variant_id) {
                            await addToCart({
                              countryCode,
                              variantId: it.variant_id,
                              quantity: it.quantity ?? 1,
                            })
                          }
                        }
                        router.push(`/${countryCode}/cart`)
                      } catch (e: any) {
                        setError(e?.message || t("account.repeatFailed"))
                      }
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--store-text)] px-5 text-sm font-semibold text-white"
                  >
                    {t("account.repeatOrder")}
                  </button>
                </div>
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

