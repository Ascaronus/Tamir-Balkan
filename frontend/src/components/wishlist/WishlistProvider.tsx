"use client"
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useAuth } from "@/components/auth/AuthProvider"
import { LoginDialog } from "@/components/auth/LoginDialog"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { sdk } from "@/lib/medusa"
import { WishlistState } from "@/lib/store/wishlist-state"

type Context = { ids: string[]; pending: string[]; ready: boolean; error: boolean; retry: () => void; toggle: (id: string, trigger: HTMLButtonElement) => void }
const WishlistContext = createContext<Context | null>(null)
type Intent = { id: string; trigger: HTMLButtonElement }
export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { customer, isReady } = useAuth()
  const [intent, setIntent] = useState<Intent | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const t = useTranslations()
  function requestLogin(id: string, button: HTMLButtonElement) { trigger.current = button; setIntent({ id, trigger: button }) }
  return <AccountWishlist owner={customer?.id ?? null} authenticated={Boolean(customer)} authReady={isReady}
    intent={intent} consume={() => setIntent(null)} requestLogin={requestLogin}>
    {children}
    {intent && !customer && <LoginDialog trigger={trigger} message={t("wishlist.signIn")} onDismiss={() => setIntent(null)} onSuccess={() => { /* consumed after the verified account loads */ }} />}
  </AccountWishlist>
}
function AccountWishlist({ children, owner, authenticated, authReady, intent, consume, requestLogin }: {
  children: React.ReactNode; owner: string | null; authenticated: boolean; authReady: boolean; intent: Intent | null;
  consume: () => void; requestLogin: (id: string, button: HTMLButtonElement) => void
}) {
  const t = useTranslations()
  const state = useMemo(() => new WishlistState({
    list: async () => (await sdk.client.fetch<{ product_ids: string[] }>("/store/wishlist", { cache: "no-store" })).product_ids,
    set: async (id, saved) => { await sdk.client.fetch(saved ? "/store/wishlist" : `/store/wishlist/${encodeURIComponent(id)}`, {
      method: saved ? "POST" : "DELETE", ...(saved ? { body: { product_id: id } } : {}), cache: "no-store",
    }) },
  }), [owner])
  const snapshot = useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot)
  const consumed = useRef<Intent | null>(null)
  useEffect(() => {
    state.activate()
    if (authenticated) void state.load()
    const refresh = () => { if (authenticated) void state.load() }
    window.addEventListener("focus", refresh)
    return () => { window.removeEventListener("focus", refresh); state.dispose() }
  }, [state, authenticated])
  useEffect(() => {
    if (!authenticated || !snapshot.ready || !intent || consumed.current === intent) return
    consumed.current = intent
    const id = intent.id
    consume()
    void state.set(id, true)
  }, [authenticated, snapshot.ready, intent, consume, state])
  return <WishlistContext.Provider value={{ ...snapshot, ready: authReady && (!authenticated || snapshot.ready), retry: () => { void state.load() },
    toggle: (id, button) => {
      if (!authReady) return
      if (!authenticated) { requestLogin(id, button); return }
      void state.set(id, !snapshot.ids.includes(id))
    } }}>
    {children}
    {snapshot.error && <div className="wishlist-notice" role="alert">{t("wishlist.error")} <button type="button" onClick={() => { void state.load() }}>{t("common.retry")}</button></div>}
  </WishlistContext.Provider>
}
export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) throw new Error("useWishlist must be used within WishlistProvider")
  return context
}
