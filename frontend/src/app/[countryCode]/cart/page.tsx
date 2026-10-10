import { StoreShell } from "@/components/store/StoreShell"
import { getTranslations } from "@/lib/i18n/server"
import { CartPageClient } from "@/components/cart/CartPageClient"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function CartPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  if (!["rs", "en"].includes(countryCode.toLowerCase())) notFound()
  const cc = "rs"

  const { t } = await getTranslations()

  return (
    <StoreShell countryCode={cc as "rs"}>
      <div className="page-content commerce-page">
        <h1 className="commerce-title">
          {t("header.cart")}
        </h1>
        <div className="mt-6">
          <CartPageClient />
        </div>
      </div>
    </StoreShell>
  )
}

