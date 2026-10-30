"use client"
import { useLocaleContext } from "@/components/i18n/LocaleProvider"
import { formatMoney } from "@/lib/format-money"
import type { ProductDelivery as Delivery } from "@/lib/store/product-delivery"

export function ProductDelivery({ delivery }: { delivery?: Delivery | null }) {
  const { locale, t } = useLocaleContext()
  const options = delivery?.options ?? []
  const price = (option: typeof options[number]) => option.amount === 0 ? t("product.deliveryFree") : formatMoney(option.amount, option.currency_code, locale === "en" ? "en-GB" : "sr-Latn-RS")
  const samePrice = options.length > 0 && options.every(option => option.amount === options[0].amount && option.currency_code === options[0].currency_code)
  return <div className="text-[var(--store-text-muted)]">
    {samePrice ? <p>{t("product.deliveryTerms", { price: price(options[0]) })}</p> : options.length > 0 ? <>
      <p>{t("product.deliveryMethods")}</p>
      <ul>{options.map(option => <li key={option.id}>{option.name}: {price(option)}</li>)}</ul>
    </> : null}
    {(!options.length || delivery?.requires_checkout) && <p>{t("product.deliveryAtCheckout")}</p>}
  </div>
}
