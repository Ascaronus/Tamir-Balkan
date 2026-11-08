"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { addToCart, getOrCreateCart, removeLineItem, updateLineItem, type Cart, type CartStockError } from "@/lib/cart/cart-client"
import { useAuth } from "@/components/auth/AuthProvider"
import { stableItems } from "@/lib/store/commerce"

import { AddedToCartDialog, type AddedProductDisplay, type CartAddition } from "./AddedToCartDialog"
import { usePathname } from "next/navigation"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { internalStorePath, localizedPath } from "@/lib/i18n/paths"

import { useLocalizedCartState } from "./useLocalizedCart"

type CartContextValue = {
  cart: Cart | null
  isReady: boolean
  isMutating: boolean
  error: string | null
  stockError: Pick<CartStockError, "variantId" | "available" | "inCart"> | null
  displayReady: boolean
  displayError: boolean
  retryDisplay: () => Promise<void>
  itemCount: number
  refresh: () => Promise<Cart>
  addItem: (variantId: string, quantity?: number, display?: AddedProductDisplay) => Promise<void>
  updateItemQuantity: (lineItemId: string, quantity: number) => Promise<void>
  removeItem: (lineItemId: string) => Promise<void>
}
const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ countryCode, children }: { countryCode: string; children: React.ReactNode }) {
  const { customer, isReady: authReady, isMutating: authMutating } = useAuth()
  const customerId = customer?.id ?? null
  const identity = customerId ?? "guest"
  const pathname = usePathname()
  const { locale } = useLocaleContext()
  const [addition, setAddition] = useState<(CartAddition & { path: string; locale: string }) | null>(null)
  const dismissAddition = useCallback(() => setAddition(null), [])
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(identity)
  const [cart, setCart] = useState<Cart | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stockError, setStockError] = useState<CartContextValue["stockError"]>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const generation = useRef(0)
  const route = internalStorePath(localizedPath(pathname, "sr"))
  const previousRoute = useRef(route)
  const commit = useCallback((next: Cart) => {
    setLoadedIdentity(identity)
    setCart(previous => ({ ...next, items: stableItems(next.items ?? [], previous?.id === next.id ? previous.items ?? [] : []) }))
    return next
  }, [identity])

  const run = useCallback((operation: () => Promise<Cart>): Promise<Cart> => {
    const version = generation.current
    setPending(n => n + 1)
    const task = queue.current.catch(() => undefined).then(async () => {
      if (version !== generation.current) throw new Error("Cart session changed")
      setError(null)
      setStockError(null)
      const next = await operation()
      if (version === generation.current) commit(next)
      return next
    }).catch((e: unknown) => {
      if (version === generation.current) {
        setError(e instanceof Error ? e.message : "Cart request failed")
        const stock = e as CartStockError | null
        setStockError(stock?.name === "CartStockError" && Number.isSafeInteger(stock.available) && stock.available >= 0
          ? { variantId: stock.variantId, available: stock.available, inCart: stock.inCart } : null)
      }
      throw e
    }).finally(() => setPending(n => Math.max(0, n - 1)))
    queue.current = task
    return task
  }, [commit])

  const refresh = useCallback(() => run(() => getOrCreateCart(countryCode, customerId)), [countryCode, customerId, run])
  useEffect(() => {
    if (!authReady || authMutating) return
    let mounted = true
    const initialize = () => {
      generation.current += 1
      setAddition(null)
      setCart(null)
      setLoadedIdentity(identity)
      setError(null)
      setStockError(null)
      setIsReady(false)
      void refresh().catch(() => undefined).finally(() => { if (mounted) setIsReady(true) })
    }
    initialize()
    window.addEventListener("tb-cart-reset", initialize)
    return () => { mounted = false; generation.current += 1; window.removeEventListener("tb-cart-reset", initialize) }
  }, [refresh, authReady, authMutating, identity])

  useEffect(() => {
    if (!authReady || previousRoute.current === route) return
    previousRoute.current = route
    // Revalidate prices on entry without replacing the visible cart with a loader.
    // Language-only navigation resolves to the same market route.
    let active = true
    if (route === "/rs/cart" || route === "/rs/checkout") {
      void Promise.resolve().then(() => { if (active) return refresh() }).catch(() => undefined)
    }
    return () => { active = false }
  }, [route, authReady, refresh])

  if (addition && (addition.path !== pathname || addition.locale !== locale)) setAddition(null)
  const sessionReady = authReady && !authMutating && loadedIdentity === identity
  const visibleCart = sessionReady ? cart : null
  const display = useLocalizedCartState(visibleCart)
  const localizedCart = display.cart
  const value = useMemo<CartContextValue>(() => ({
    cart: localizedCart, displayReady: display.ready, displayError: display.error,
    retryDisplay: async () => { display.retry(); await refresh() }, isReady: isReady && sessionReady, isMutating: pending > 0 || Boolean(authMutating), error: sessionReady ? error : null, stockError: sessionReady ? stockError : null,
    itemCount: visibleCart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    refresh,
    addItem: async (variantId, quantity = 1, display) => {
      const version = generation.current
      const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const next = await run(() => addToCart({ countryCode, customerId, variantId, quantity }))
      const item = next.items?.find(item => item.variant_id === variantId)
      if (version === generation.current && item) setAddition({ cartId: next.id, lineId: item.id, quantity, trigger, display, path: pathname, locale })
    },
    updateItemQuantity: async (lineItemId, quantity) => { await run(() => updateLineItem({ countryCode, customerId, lineItemId, quantity })) },
    removeItem: async (lineItemId) => { await run(() => removeLineItem({ countryCode, customerId, lineItemId })) },
  }), [localizedCart, display, isReady, pending, error, stockError, refresh, run, countryCode, customerId, pathname, locale, sessionReady, visibleCart, authMutating])
  return <CartContext.Provider value={value}>{children}{addition && localizedCart && addition.cartId === localizedCart.id && addition.path === pathname && addition.locale === locale && <AddedToCartDialog cart={localizedCart} addition={addition} onDismiss={dismissAddition} />}</CartContext.Provider>
}
export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error("useCart must be used within CartProvider")
  return value
}
