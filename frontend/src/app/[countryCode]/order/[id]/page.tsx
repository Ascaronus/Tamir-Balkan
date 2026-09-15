import { StoreShell } from "@/components/store/StoreShell"
import { OrderConfirmation } from "@/components/checkout/OrderConfirmation"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function OrderPage(props: {
  params: Promise<{ countryCode: string; id: string }>
}) {
  const { countryCode, id } = await props.params
  const cc = countryCode.toLowerCase()
  if (cc !== "rs") notFound()



  return (
    <StoreShell countryCode={cc as "rs"}>
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
          <OrderConfirmation id={id} />
        </div>
      </div>
    </StoreShell>
  )
}

