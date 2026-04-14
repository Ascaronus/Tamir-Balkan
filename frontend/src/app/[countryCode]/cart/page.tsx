import { StoreShell } from "@/components/store/StoreShell"
import { getTranslations } from "@/lib/i18n/server"
import { CartPageClient } from "@/components/cart/CartPageClient"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function CartPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const cc = countryCode.toLowerCase()
  if (cc !== "rs" && cc !== "me") notFound()

  const { t } = await getTranslations()

  return (
    <StoreShell countryCode={cc as "rs" | "me"}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--store-text)]">
          {t("header.cart")}
        </h1>
        <div className="mt-6">
          <CartPageClient />
        </div>
      </div>
    </StoreShell>
  )
}

