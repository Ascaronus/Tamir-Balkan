import { notFound } from "next/navigation"
import { StoreShell } from "@/components/store/StoreShell"
import { WishlistPage } from "@/components/wishlist/WishlistPage"
import { getTranslations } from "@/lib/i18n/server"
export const dynamic = "force-dynamic"
export const metadata = { robots: { index: false, follow: false } }
export default async function Page({ params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params
  if (!["rs", "en"].includes(countryCode)) notFound()
  const { t } = await getTranslations()
  return <StoreShell countryCode="rs"><div className="page-content commerce-page"><h1 className="commerce-title">{t("wishlist.title")}</h1><div className="mt-6"><WishlistPage /></div></div></StoreShell>
}
