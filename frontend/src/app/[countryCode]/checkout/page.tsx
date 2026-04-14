import { StoreShell } from "@/components/store/StoreShell"
import { notFound } from "next/navigation"
import { CheckoutPageClient } from "@/components/checkout/CheckoutPageClient"

export const dynamic = "force-dynamic"

export default async function CheckoutPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const cc = countryCode.toLowerCase()
  if (cc !== "rs" && cc !== "me") notFound()

  return (
    <StoreShell countryCode={cc as "rs" | "me"}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <CheckoutPageClient countryCode={cc} />
      </div>
    </StoreShell>
  )
}

