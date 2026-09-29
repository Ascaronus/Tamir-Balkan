import { DesignIcon } from "@/components/store/DesignIcon"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { useCart } from "./CartProvider"

export function CartLink({ href }: { href: string }) {
  const t = useTranslations()
  const { itemCount, isReady } = useCart()

  return (
    <span className="relative inline-flex items-center">
      {isReady && itemCount > 0 ? (
        <span className="absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--store-accent)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
      <span className="sr-only">{t("header.cart")}</span>
      <DesignIcon name="bag" />
    </span>
  )
}

