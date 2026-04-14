"use client"

import { useCart } from "@/components/cart/CartProvider"
import { formatMoney } from "@/lib/format-money"

function lineTotal(item: any): number | null {
  // Medusa can return totals when configured; fall back to null
  const t = item?.total
  return typeof t === "number" ? t : null
}

export function CartPageClient() {
  const { cart, isReady, isMutating, updateItemQuantity, removeItem } = useCart()

  if (!isReady) {
    return (
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6 text-sm text-[var(--store-text-muted)]">
        Loading…
      </div>
    )
  }

  const items = cart?.items ?? []
  const currency = cart?.currency_code ?? "eur"

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6 text-sm text-[var(--store-text-muted)]">
        Cart is empty.
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
            it?.product_title || it?.title || it?.variant_title || "Item"
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
                    aria-label="Decrease quantity"
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
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => removeItem(it.id)}
                    className="ml-2 inline-flex h-9 items-center justify-center rounded-full border border-[var(--store-border)] px-4 text-sm font-medium text-[var(--store-text)] disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {subtotal !== null ? (
        <div className="flex items-center justify-between border-t border-[var(--store-border)] px-4 py-4 text-sm sm:px-6">
          <span className="text-[var(--store-text-muted)]">Subtotal</span>
          <span className="font-semibold text-[var(--store-text)]">
            {formatMoney(subtotal, currency)}
          </span>
        </div>
      ) : null}
    </div>
  )
}

