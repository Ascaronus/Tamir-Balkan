import { StoreShell } from "@/components/store/StoreShell"
import { getTranslations } from "@/lib/i18n/server"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function OrderPage(props: {
  params: Promise<{ countryCode: string; id: string }>
}) {
  const { countryCode, id } = await props.params
  const cc = countryCode.toLowerCase()
  if (cc !== "rs" && cc !== "me") notFound()

  const { t } = await getTranslations()

  return (
    <StoreShell countryCode={cc as "rs" | "me"}>
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-[var(--store-border)] bg-white p-6">
          <h1 className="text-xl font-semibold text-[var(--store-text)]">
            {t("order.confirmed")}
          </h1>
          <p className="mt-2 text-sm text-[var(--store-text-muted)]">
            {t("order.orderId")}{" "}
            <span className="font-mono">{id}</span>
          </p>
          <p className="mt-4 text-sm text-[var(--store-text-muted)]">
            {t("order.adminNote")}
          </p>
        </div>
      </div>
    </StoreShell>
  )
}

