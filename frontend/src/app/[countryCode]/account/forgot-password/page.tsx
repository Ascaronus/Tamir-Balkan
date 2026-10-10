import { notFound } from "next/navigation"
import { StoreShell } from "@/components/store/StoreShell"
import { PasswordResetForm } from "@/components/auth/PasswordResetForm"
export const dynamic = "force-dynamic"
export default async function PasswordResetPage({ params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params
  if (!["rs", "en"].includes(countryCode.toLowerCase())) notFound()
  return <StoreShell countryCode="rs"><div className="auth-content"><PasswordResetForm countryCode="rs" /></div></StoreShell>
}
