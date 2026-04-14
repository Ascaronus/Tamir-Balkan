const CART_ID_KEY = "tb_cart_id"

export function getStoredCartId(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(CART_ID_KEY)
  } catch {
    return null
  }
}

export function setStoredCartId(cartId: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(CART_ID_KEY, cartId)
  } catch {
    // ignore
  }
}

export function clearStoredCartId() {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(CART_ID_KEY)
  } catch {
    // ignore
  }
}

