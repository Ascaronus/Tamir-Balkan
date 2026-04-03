"use client"

import Image from "next/image"
import Link from "next/link"
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher"
import { useTranslations } from "@/components/i18n/LocaleProvider"

type Country = "rs" | "me"

export function ShopHeader({
  countryCode,
  onOpenCatalog,
}: {
  countryCode?: Country
  onOpenCatalog: () => void
}) {
  const t = useTranslations()
  const cartHref = countryCode ? `/${countryCode}/catalog` : "/"

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--store-border)] bg-[var(--store-bg)]">
      <div className="mx-auto max-w-[1600px] px-3 pt-2 sm:px-5">
        <div className="flex flex-wrap items-center justify-end gap-2 gap-y-1 text-[0.72rem] uppercase tracking-[0.08em] text-[var(--store-text)]">
          <span className="mr-auto hidden sm:inline text-[var(--store-text-muted)] normal-case tracking-normal">
            +381 11 000 0000
          </span>
          <LanguageSwitcher />
          <Link
            href="/rs/catalog"
            className={
              countryCode === "rs"
                ? "font-semibold text-[var(--store-text)]"
                : "text-[var(--store-text-muted)] hover:text-[var(--store-text)]"
            }
          >
            RS
          </Link>
          <span className="text-[var(--store-border)]">|</span>
          <Link
            href="/me/catalog"
            className={
              countryCode === "me"
                ? "font-semibold text-[var(--store-text)]"
                : "text-[var(--store-text-muted)] hover:text-[var(--store-text)]"
            }
          >
            ME
          </Link>
          <Link
            href={cartHref}
            className="ml-2 flex items-center gap-1.5 text-[var(--store-text-muted)] hover:text-[var(--store-text)]"
            aria-label={t("header.cartAria")}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="shrink-0"
              aria-hidden
            >
              <path
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 6h15l-1.5 9h-12z"
              />
              <path
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                d="M6 6L5 3H2"
              />
              <circle cx="9" cy="20" r="1.5" fill="currentColor" />
              <circle cx="18" cy="20" r="1.5" fill="currentColor" />
            </svg>
            <span className="hidden sm:inline">{t("header.cart")}</span>
          </Link>
        </div>

        <div className="relative flex min-h-[3.5rem] items-center justify-center py-2">
          <button
            type="button"
            onClick={onOpenCatalog}
            className="absolute left-0 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-md px-1 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--store-text)] hover:bg-black/[0.04] md:hidden"
            aria-expanded="false"
            aria-controls="store-sidebar"
          >
            <span className="flex flex-col gap-1" aria-hidden>
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
              <span className="block h-0.5 w-5 bg-current" />
            </span>
            <span className="hidden sm:inline">{t("header.catalog")}</span>
          </button>

          <Link
            href="/"
            className="flex flex-col items-center justify-center"
            aria-label={t("header.homeAria")}
          >
            <Image
              src="/log.png"
              alt="Tamir Balkan"
              width={200}
              height={64}
              className="h-12 w-auto max-w-[min(100vw-8rem,200px)] object-contain"
              priority
            />
          </Link>
        </div>
      </div>
    </header>
  )
}
