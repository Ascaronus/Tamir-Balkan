"use client"

import type { HttpTypes } from "@medusajs/types"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  addToCart as addToCartApi,
  getOrCreateCart,
  removeLineItem as removeLineItemApi,
  updateLineItem as updateLineItemApi,
  type Cart,
} from "@/lib/cart/cart-client"

type CartContextValue = {
  cart: Cart | null
  isReady: boolean
  isMutating: boolean
  itemCount: number
  refresh: () => Promise<void>
  addItem: (variantId: string, quantity?: number) => Promise<void>
  updateItemQuantity: (lineItemId: string, quantity: number) => Promise<void>
  removeItem: (lineItemId: string) => Promise<void>
}

const CartContext = createContext<CartContextValue | null>(null)

function countItems(cart: Cart | null): number {
  if (!cart?.items?.length) return 0
  return cart.items.reduce((sum, it) => sum + (it.quantity ?? 0), 0)
}

export function CartProvider({
  countryCode,
  children,
}: {
  countryCode: string
  children: React.ReactNode
}) {
  const [cart, setCart] = useState<Cart | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isMutating, setIsMutating] = useState(false)

  const refresh = useCallback(async () => {
    const next = await getOrCreateCart(countryCode)
    setCart(next)
  }, [countryCode])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const next = await getOrCreateCart(countryCode)
        if (!cancelled) setCart(next)
      } finally {
        if (!cancelled) setIsReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [countryCode])

  const addItem = useCallback(
    async (variantId: string, quantity = 1) => {
      setIsMutating(true)
      try {
        const next = await addToCartApi({ countryCode, variantId, quantity })
        setCart(next)
      } finally {
        setIsMutating(false)
      }
    },
    [countryCode]
  )

  const updateItemQuantity = useCallback(
    async (lineItemId: string, quantity: number) => {
      setIsMutating(true)
      try {
        const next = await updateLineItemApi({ countryCode, lineItemId, quantity })
        setCart(next)
      } finally {
        setIsMutating(false)
      }
    },
    [countryCode]
  )

  const removeItem = useCallback(
    async (lineItemId: string) => {
      setIsMutating(true)
      try {
        const next = await removeLineItemApi({ countryCode, lineItemId })
        setCart(next)
      } finally {
        setIsMutating(false)
      }
    },
    [countryCode]
  )

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      isReady,
      isMutating,
      itemCount: countItems(cart),
      refresh,
      addItem,
      updateItemQuantity,
      removeItem,
    }),
    [cart, isReady, isMutating, refresh, addItem, updateItemQuantity, removeItem]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider")
  }
  return ctx
}

