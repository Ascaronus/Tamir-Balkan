"use client"
import { LanguagePaths } from "@/components/i18n/LanguagePaths"
import type { Locale } from "@/lib/i18n/config"
import { useRef } from "react"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { ShopHeader } from "./ShopHeader"
import { StoreFooter } from "./StoreFooter"
import { CategoryNavigation, CategoryProvider } from "./CategoryNavigation"
import { DesignIcon } from "./DesignIcon"
import { CartProvider } from "@/components/cart/CartProvider"
import { AuthProvider } from "@/components/auth/AuthProvider"
import type { HttpTypes } from "@medusajs/types"

export function StoreShell({ children, countryCode, initialCategories, activeCategoryId, languagePaths = {} }: { children: React.ReactNode; countryCode?: "rs"; initialCategories?: HttpTypes.StoreProductCategory[]; activeCategoryId?: string; languagePaths?: Partial<Record<Locale, string>> }) {
  const menu = useRef<HTMLDialogElement>(null)
  const t = useTranslations()
  return <LanguagePaths.Provider value={languagePaths}><AuthProvider><CartProvider countryCode={countryCode ?? "rs"}><CategoryProvider initialCategories={initialCategories} activeCategoryId={activeCategoryId}>
    <div className="store-shell">
      <ShopHeader countryCode={countryCode} onOpenCatalog={() => menu.current?.showModal()} />
      <dialog ref={menu} id="store-sidebar" className="navigation-drawer" aria-label={t("header.catalog")} onClick={e => { if (e.target === e.currentTarget) menu.current?.close() }}>
        <div className="flex items-center justify-between pb-6"><span className="text-lg font-semibold">{t("header.catalog")}</span><button className="icon-button" type="button" aria-label={t("common.close")} onClick={() => menu.current?.close()}><DesignIcon name="close" /></button></div>
        <CategoryNavigation onNavigate={() => menu.current?.close()} />
      </dialog>
      <main id="main-content" className="store-main">{children}</main>
      <StoreFooter />
    </div>
  </CategoryProvider></CartProvider></AuthProvider></LanguagePaths.Provider>
}
