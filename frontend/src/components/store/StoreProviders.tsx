"use client"

import { AuthProvider } from "@/components/auth/AuthProvider"
import { CartProvider } from "@/components/cart/CartProvider"
import { WishlistProvider } from "@/components/wishlist/WishlistProvider"

// Keep session state above page routes so navigation does not bootstrap it again.
export function StoreProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider><WishlistProvider><CartProvider countryCode="rs">{children}</CartProvider></WishlistProvider></AuthProvider>
}
