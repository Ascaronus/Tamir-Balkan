"use client"

import { useState } from "react"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { ShopHeader } from "./ShopHeader"
import { ShopSidebar } from "./ShopSidebar"
import { StoreFooter } from "./StoreFooter"

type Country = "rs" | "me"

export function StoreShell({
  children,
  countryCode,
}: {
  children: React.ReactNode
  countryCode?: Country
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const t = useTranslations()

  return (
    <div className="flex min-h-screen bg-[var(--store-bg)]">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          aria-label={t("shell.closeMenu")}
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        id="store-sidebar"
        className={`fixed left-0 top-0 z-50 flex h-full w-[280px] flex-col border-r border-white/10 bg-[#0a0a0a] text-neutral-100 transition-transform duration-200 ease-out md:static md:z-0 md:h-auto md:min-h-screen md:flex-shrink-0 md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <ShopSidebar
          countryCode={countryCode}
          onNavigate={() => setMobileNavOpen(false)}
        />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:pl-0">
        <ShopHeader
          countryCode={countryCode}
          onOpenCatalog={() => setMobileNavOpen(true)}
        />
        <div className="flex-1">{children}</div>
        <StoreFooter />
      </div>
    </div>
  )
}
