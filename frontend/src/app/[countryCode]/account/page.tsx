import { StoreShell } from "@/components/store/StoreShell"
import { notFound } from "next/navigation"
import { AccountPageClient } from "@/components/auth/AccountPageClient"

export const dynamic = "force-dynamic"

export default async function AccountPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const cc = countryCode.toLowerCase()
  if (cc !== "rs" && cc !== "me") notFound()

  return (
    <StoreShell countryCode={cc as "rs" | "me"}>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <AccountPageClient countryCode={cc} />
      </div>
    </StoreShell>
  )
}

