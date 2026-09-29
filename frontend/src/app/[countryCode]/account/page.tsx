import { StoreShell } from "@/components/store/StoreShell"
import { notFound } from "next/navigation"
import { AccountPageClient } from "@/components/auth/AccountPageClient"

export const dynamic = "force-dynamic"

export default async function AccountPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const cc = countryCode.toLowerCase()
  if (cc !== "rs") notFound()

  return (
    <StoreShell countryCode={cc as "rs"}>
      <div className="page-content">
        <AccountPageClient countryCode={cc} />
      </div>
    </StoreShell>
  )
}

