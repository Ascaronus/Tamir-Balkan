"use client"
import Image from "next/image"
import Link from "next/link"
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { CartLink } from "@/components/cart/CartLink"
import { useAuth } from "@/components/auth/AuthProvider"
import { CategoryNavigation } from "./CategoryNavigation"
import { DesignIcon } from "./DesignIcon"

export function ShopHeader({ onOpenCatalog }: { countryCode?: "rs"; onOpenCatalog: () => void; menuOpen?: boolean }) {
  const t = useTranslations()
  const { isLoggedIn } = useAuth()
  return <header className="shop-header">
    <div className="shop-header-row store-container">
      <div className="header-tools">
        <button type="button" onClick={onOpenCatalog} className="icon-button mobile-menu" aria-label={t("header.catalog")} aria-haspopup="dialog" aria-controls="store-sidebar"><DesignIcon name="menu" /></button>

      </div>
      <Link href="/" className="brand-link" aria-label={t("header.homeAria")}><Image src="/log.png" alt="TAMIR — Collection for men" width={139} height={78} sizes="(max-width: 900px) 94px, 120px" className="brand-logo" preload /></Link>
      <div className="header-actions"><div className="header-language"><LanguageSwitcher /></div><Link className="header-action" href={isLoggedIn ? "/rs/account" : "/rs/account/login"} aria-label={t("header.account")}><DesignIcon name="user" /><span className="header-action-label">{t("header.account")}</span></Link><Link href="/rs/cart" className="header-action" aria-label={t("header.cartAria")}><CartLink href="/rs/cart" /><span className="header-action-label">{t("header.cart")}</span></Link></div>
    </div>
    <div className="header-categories"><CategoryNavigation horizontal /></div>
  </header>
}
