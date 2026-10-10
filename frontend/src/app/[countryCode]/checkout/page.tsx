import { StoreShell } from "@/components/store/StoreShell"
import { notFound } from "next/navigation"
import { CheckoutPageClient } from "@/components/checkout/CheckoutPageClient"

export const dynamic = "force-dynamic"

export default async function CheckoutPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  if (!["rs", "en"].includes(countryCode.toLowerCase())) notFound()
  const cc = "rs"

  return (
    <StoreShell countryCode={cc as "rs"}>
      <div className="page-content commerce-page">
        <CheckoutPageClient countryCode={cc} />
      </div>
    </StoreShell>
  )
}

