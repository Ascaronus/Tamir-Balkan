"use client"

import { useCart } from "@/components/cart/CartProvider"

export function AddToCartButton({
  variantId,
  disabled,
  children,
}: {
  variantId: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const { addItem, isMutating } = useCart()

  return (
    <button
      type="button"
      disabled={disabled || isMutating}
      onClick={() => addItem(variantId, 1)}
      className={`inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--store-text)] px-8 text-sm font-semibold text-white transition ${
        disabled || isMutating ? "opacity-60" : "hover:opacity-90"
      }`}
    >
      {children}
    </button>
  )
}

