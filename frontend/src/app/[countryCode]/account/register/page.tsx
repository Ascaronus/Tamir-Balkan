import { StoreShell } from "@/components/store/StoreShell"
import { notFound } from "next/navigation"
import { RegisterForm } from "@/components/auth/RegisterForm"

export const dynamic = "force-dynamic"

export default async function RegisterPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  if (!["rs", "en"].includes(countryCode.toLowerCase())) notFound()
  const cc = "rs"

  return (
    <StoreShell countryCode={cc as "rs"}>
      <div className="auth-content">
        <RegisterForm countryCode={cc} />
      </div>
    </StoreShell>
  )
}

