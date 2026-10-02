import { StoreShell } from "@/components/store/StoreShell"
import { notFound } from "next/navigation"
import { CheckoutPageClient } from "@/components/checkout/CheckoutPageClient"

export const dynamic = "force-dynamic"

export default async function CheckoutPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const cc = countryCode.toLowerCase()
  if (cc !== "rs") notFound()

  return (
    <StoreShell countryCode={cc as "rs"}>
      <div className="page-content commerce-page">
        <CheckoutPageClient countryCode={cc} />
      </div>
    </StoreShell>
  )
}

