"use client"
import Link from "next/link"
import { CookieSettingsButton } from "@/components/privacy/CookieConsent"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher"
export function StoreFooter() {
  const t = useTranslations()
  return <footer className="store-footer"><div className="store-container footer-content"><div className="footer-columns">
    <div><h2>TAMIR</h2><p>{t("design.brand")}</p></div>
    <div><h3>{t("design.shopping")}</h3><Link href="/terms">{t("design.delivery")}</Link><Link href="/terms">{t("design.returns")}</Link><Link href="/rs/catalog">{t("catalog.catalog")}</Link></div>
    <div><h3>{t("design.support")}</h3><Link href="/terms">{t("legal.terms")}</Link><Link href="/privacy">{t("legal.privacy")}</Link><Link href="/cookies">{t("cookies.policy")}</Link></div>
    <div><h3>{t("header.account")}</h3><Link href="/rs/account/login">{t("header.login")}</Link><Link href="/rs/account">{t("account.orders")}</Link><div className="mt-3 w-fit"><LanguageSwitcher /></div></div>
  </div><nav className="footer-bottom" aria-label={t("legal.links")}><p>{t("footer.rights", { year: new Date().getFullYear() })}</p><Link href="/privacy">{t("legal.privacy")}</Link><Link href="/terms">{t("legal.terms")}</Link><CookieSettingsButton /></nav></div></footer>
}
