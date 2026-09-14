"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { addToCart, getOrCreateCart, removeLineItem, updateLineItem, type Cart } from "@/lib/cart/cart-client"
import { stableItems } from "@/lib/store/commerce"

type CartContextValue = {
  cart: Cart | null
  isReady: boolean
  isMutating: boolean
  error: string | null
  itemCount: number
  refresh: () => Promise<Cart>
  addItem: (variantId: string, quantity?: number) => Promise<void>
  updateItemQuantity: (lineItemId: string, quantity: number) => Promise<void>
  removeItem: (lineItemId: string) => Promise<void>
}
const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ countryCode, children }: { countryCode: string; children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const generation = useRef(0)
  const commit = useCallback((next: Cart) => {
    setCart(previous => ({ ...next, items: stableItems(next.items ?? [], previous?.id === next.id ? previous.items ?? [] : []) }))
    return next
  }, [])

  const run = useCallback((operation: () => Promise<Cart>): Promise<Cart> => {
    const version = generation.current
    setPending(n => n + 1)
    const task = queue.current.catch(() => undefined).then(async () => {
      if (version !== generation.current) throw new Error("Cart session changed")
      setError(null)
      const next = await operation()
      if (version === generation.current) commit(next)
      return next
    }).catch((e: unknown) => {
      if (version === generation.current) setError(e instanceof Error ? e.message : "Cart request failed")
      throw e
    }).finally(() => setPending(n => Math.max(0, n - 1)))
    queue.current = task
    return task
  }, [commit])

  const refresh = useCallback(() => run(() => getOrCreateCart(countryCode)), [countryCode, run])
  useEffect(() => {
    let mounted = true
    const initialize = () => {
      generation.current += 1
      setIsReady(false)
      void refresh().catch(() => undefined).finally(() => { if (mounted) setIsReady(true) })
    }
    initialize()
    window.addEventListener("tb-cart-reset", initialize)
    return () => { mounted = false; generation.current += 1; window.removeEventListener("tb-cart-reset", initialize) }
  }, [refresh])

  const value = useMemo<CartContextValue>(() => ({
    cart, isReady, isMutating: pending > 0, error,
    itemCount: cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    refresh,
    addItem: async (variantId, quantity = 1) => { await run(() => addToCart({ countryCode, variantId, quantity })) },
    updateItemQuantity: async (lineItemId, quantity) => { await run(() => updateLineItem({ countryCode, lineItemId, quantity })) },
    removeItem: async (lineItemId) => { await run(() => removeLineItem({ countryCode, lineItemId })) },
  }), [cart, isReady, pending, error, refresh, run, countryCode])
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error("useCart must be used within CartProvider")
  return value
}
