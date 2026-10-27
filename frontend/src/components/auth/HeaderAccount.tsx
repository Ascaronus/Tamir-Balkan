"use client"

import { useEffect, useId, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import Link from "@/components/i18n/LocalizedLink"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { DesignIcon } from "@/components/store/DesignIcon"
import { useAuth } from "./AuthProvider"
import { LoginDialog } from "./LoginDialog"
import { customerDisplayName } from "@/lib/auth/customer-display-name"

export function HeaderAccount() {
  const pathname = usePathname()
  const { locale } = useLocaleContext()
  // Navigation/language changes dispose of the open dialog and its form values.
  return <HeaderAccountControl key={`${pathname}:${locale}`} />
}

export function HeaderAccountControl() {
  const { t } = useLocaleContext()
  const { customer, isReady, isMutating, logout } = useAuth()
  const [loginOpen, setLoginOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [logoutError, setLogoutError] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const menuOpen = Boolean(customer && menuFor === customer.id)
  const name = customer ? customerDisplayName(customer) || t("headerAuth.myAccount") : t("auth.login.signIn")

  useEffect(() => {
    if (!menuOpen) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setMenuFor(null)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [menuOpen])

  return <div className="header-account" ref={container}
    onKeyDown={event => { if (event.key === "Escape" && menuOpen) { event.preventDefault(); setMenuFor(null); trigger.current?.focus() } }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuFor(null) }}>
    <button ref={trigger} type="button" className="header-action header-account-trigger" disabled={!isReady}
      title={name} aria-label={name} aria-expanded={customer ? menuOpen : loginOpen}
      aria-haspopup={customer ? undefined : "dialog"} aria-controls={menuOpen ? menuId : undefined}
      onClick={() => { setLogoutError(false); if (customer) setMenuFor(menuOpen ? null : customer.id); else setLoginOpen(true) }}>
      <DesignIcon name="user" /><span className="header-account-name">{name}</span>
    </button>
    {menuOpen && <nav id={menuId} className="header-account-menu" aria-label={t("headerAuth.myAccount")}>
      <Link href="/rs/account?panel=profile" onClick={() => setMenuFor(null)}>{t("headerAuth.myAccount")}</Link>
      <Link href="/rs/account?panel=orders" onClick={() => setMenuFor(null)}>{t("headerAuth.myOrders")}</Link>
      <button type="button" disabled={isMutating} onClick={async () => {
        if (isMutating) return
        setLogoutError(false)
        try { await logout(); setMenuFor(null); trigger.current?.focus() }
        catch { setLogoutError(true) }
      }}>{isMutating ? t("headerAuth.signingOut") : t("headerAuth.signOut")}</button>
      {logoutError && <p role="alert">{t("headerAuth.logoutFailed")}</p>}
    </nav>}
    {loginOpen && !customer && <LoginDialog trigger={trigger} onDismiss={() => setLoginOpen(false)} />}
  </div>
}
