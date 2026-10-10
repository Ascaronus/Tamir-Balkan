import { StoreShell } from "@/components/store/StoreShell"
import { notFound } from "next/navigation"
import { LoginForm } from "@/components/auth/LoginForm"

export const dynamic = "force-dynamic"

export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string }>
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const next = (await props.searchParams).next === "checkout" ? "checkout" : "account"
  if (!["rs", "en"].includes(countryCode.toLowerCase())) notFound()
  const cc = "rs"

  return (
    <StoreShell countryCode={cc as "rs"}>
      <div className="auth-content">
        <LoginForm countryCode={cc} next={next} />
      </div>
    </StoreShell>
  )
}

