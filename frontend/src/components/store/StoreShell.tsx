"use client"
import { useRef } from "react"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher"
import { ShopHeader } from "./ShopHeader"
import { StoreFooter } from "./StoreFooter"
import { CategoryNavigation, CategoryProvider } from "./CategoryNavigation"
import { DesignIcon } from "./DesignIcon"
import { CartProvider } from "@/components/cart/CartProvider"
import { AuthProvider } from "@/components/auth/AuthProvider"

export function StoreShell({ children, countryCode }: { children: React.ReactNode; countryCode?: "rs" }) {
  const menu = useRef<HTMLDialogElement>(null)
  const t = useTranslations()
  return <AuthProvider><CartProvider countryCode={countryCode ?? "rs"}><CategoryProvider>
    <div className="store-shell">
      <ShopHeader countryCode={countryCode} onOpenCatalog={() => menu.current?.showModal()} />
      <dialog ref={menu} id="store-sidebar" className="navigation-drawer" aria-label={t("header.catalog")} onClick={e => { if (e.target === e.currentTarget) menu.current?.close() }}>
        <div className="flex items-center justify-between pb-6"><LanguageSwitcher /><button className="icon-button" type="button" aria-label={t("common.close")} onClick={() => menu.current?.close()}><DesignIcon name="close" /></button></div>
        <form action="/rs/catalog" className="mb-6 flex gap-2" onSubmit={() => menu.current?.close()}><input name="q" maxLength={200} aria-label={t("catalog.search")} placeholder={t("catalog.searchPlaceholder")} className="min-w-0 flex-1 rounded border p-3" /><button className="icon-button" aria-label={t("catalog.search")}><DesignIcon name="search" /></button></form>
        <CategoryNavigation onNavigate={() => menu.current?.close()} />
      </dialog>
      <main id="main-content" className="store-main">{children}</main>
      <StoreFooter />
    </div>
  </CategoryProvider></CartProvider></AuthProvider>
}
