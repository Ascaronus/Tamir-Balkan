"use client"
import { useRef } from "react"
import { useTranslations } from "@/components/i18n/LocaleProvider"
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
        <div className="flex items-center justify-between pb-6"><span className="text-lg font-semibold">{t("header.catalog")}</span><button className="icon-button" type="button" aria-label={t("common.close")} onClick={() => menu.current?.close()}><DesignIcon name="close" /></button></div>
        <CategoryNavigation onNavigate={() => menu.current?.close()} />
      </dialog>
      <main id="main-content" className="store-main">{children}</main>
      <StoreFooter />
    </div>
  </CategoryProvider></CartProvider></AuthProvider>
}
