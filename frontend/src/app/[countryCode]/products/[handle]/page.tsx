import Link from "next/link"
import { notFound } from "next/navigation"
import { listProductsByCountry } from "@/lib/store/products"
import { StoreShell } from "@/components/store/StoreShell"
import { getTranslations } from "@/lib/i18n/server"
import { ProductDetails } from "@/components/product/ProductDetails"

export const dynamic = "force-dynamic"
export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ countryCode: string; handle: string }>
  searchParams: Promise<{ v_id?: string }>
}) {
  const { t, locale } = await getTranslations()
  const { countryCode, handle } = await params
  if (countryCode.toLowerCase() !== "rs") notFound()
  const { products } = await listProductsByCountry({ countryCode: "rs", handle, limit: 1, locale })
  const product = products[0]
  if (!product) notFound()
  return <StoreShell countryCode="rs">
    <nav className="border-b bg-[var(--store-bg-muted)] px-6 py-5 text-sm"><Link href="/rs/catalog">{t("product.catalog")}</Link></nav>
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><ProductDetails key={product.id} product={product} initialVariantId={(await searchParams).v_id} /></div>
  </StoreShell>
}
