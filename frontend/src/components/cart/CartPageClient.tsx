"use client"

import { useCart } from "@/components/cart/CartProvider"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { formatMoney } from "@/lib/format-money"
import Link from "next/link"

function lineTotal(item: any): number | null {
  // Medusa can return totals when configured; fall back to null
  const t = item?.total
  return typeof t === "number" ? t : null
}

export function CartPageClient() {
  const t = useTranslations()
  const { cart, isReady, isMutating, updateItemQuantity, removeItem } = useCart()

  if (!isReady) {
    return (
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6 text-sm text-[var(--store-text-muted)]">
        {t("cartPage.loading")}
      </div>
    )
  }

  const items = cart?.items ?? []
  const currency = cart?.currency_code ?? "eur"
  const cc =
    (cart as any)?.shipping_address?.country_code?.toLowerCase() === "me"
      ? "me"
      : "rs"

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6 text-sm text-[var(--store-text-muted)]">
        {t("cartPage.empty")}
      </div>
    )
  }

  const subtotal =
    typeof (cart as any)?.subtotal === "number" ? (cart as any).subtotal : null

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--store-border)] bg-white">
      <ul className="divide-y divide-[var(--store-border)]">
        {items.map((it: any) => {
          const title =
            it?.product_title ||
            it?.title ||
            it?.variant_title ||
            t("common.itemPlaceholder")
          const qty = typeof it?.quantity === "number" ? it.quantity : 1
          const total = lineTotal(it)
          return (
            <li key={it.id} className="p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--store-text)]">
                    {title}
                  </div>
                  {total !== null ? (
                    <div className="mt-1 text-sm text-[var(--store-text-muted)]">
                      {formatMoney(total, currency)}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isMutating || qty <= 1}
                    onClick={() => updateItemQuantity(it.id, Math.max(1, qty - 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--store-border)] text-[var(--store-text)] disabled:opacity-60"
                    aria-label={t("cartPage.decreaseQty")}
                  >
                    −
                  </button>
                  <span className="min-w-10 text-center text-sm text-[var(--store-text)]">
                    {qty}
                  </span>
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => updateItemQuantity(it.id, qty + 1)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--store-border)] text-[var(--store-text)] disabled:opacity-60"
                    aria-label={t("cartPage.increaseQty")}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => removeItem(it.id)}
                    className="ml-2 inline-flex h-9 items-center justify-center rounded-full border border-[var(--store-border)] px-4 text-sm font-medium text-[var(--store-text)] disabled:opacity-60"
                  >
                    {t("cartPage.remove")}
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {subtotal !== null ? (
        <div className="flex items-center justify-between border-t border-[var(--store-border)] px-4 py-4 text-sm sm:px-6">
          <span className="text-[var(--store-text-muted)]">
            {t("cartPage.subtotal")}
          </span>
          <span className="font-semibold text-[var(--store-text)]">
            {formatMoney(subtotal, currency)}
          </span>
        </div>
      ) : null}

      <div className="border-t border-[var(--store-border)] px-4 py-5 sm:px-6">
        <Link
          href={`/${cc}/checkout`}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--store-text)] px-6 text-sm font-semibold text-white"
        >
          {t("cartPage.checkout")}
        </Link>
        <p className="mt-2 text-xs text-[var(--store-text-muted)]">
          {t("cartPage.guestCheckoutHint")}
        </p>
      </div>
    </div>
  )
}

