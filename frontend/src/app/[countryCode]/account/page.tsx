import { StoreShell } from "@/components/store/StoreShell"
import { notFound } from "next/navigation"
import { AccountPageClient } from "@/components/auth/AccountPageClient"

export const dynamic = "force-dynamic"

export default async function AccountPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  if (!["rs", "en"].includes(countryCode.toLowerCase())) notFound()
  const cc = "rs"

  return (
    <StoreShell countryCode={cc as "rs"}>
      <div className="page-content commerce-page account-page">
        <AccountPageClient countryCode={cc} />
      </div>
    </StoreShell>
  )
}

