import { StoreShell } from "@/components/store/StoreShell"
import { notFound } from "next/navigation"
import { LoginForm } from "@/components/auth/LoginForm"

export const dynamic = "force-dynamic"

export default async function LoginPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const cc = countryCode.toLowerCase()
  if (cc !== "rs" && cc !== "me") notFound()

  return (
    <StoreShell countryCode={cc as "rs" | "me"}>
      <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <LoginForm countryCode={cc} />
      </div>
    </StoreShell>
  )
}

