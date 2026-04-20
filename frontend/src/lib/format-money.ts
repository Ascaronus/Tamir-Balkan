/** Форматирование цены для витрины (Medusa обычно хранит суммы в minor units, например EUR в центах). */
export function formatMoney(
  amount: number | null | undefined,
  currencyCode: string | null | undefined
): string {
  if (amount == null || Number.isNaN(amount)) {
    return "—"
  }
  if (!currencyCode) {
    return String(amount)
  }
  const code = currencyCode.toUpperCase()
  const normalized =
    code === "RSD"
      ? amount
      : // most currencies (EUR/USD) are stored in minor units in Medusa
        amount / 100
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: code === "RSD" ? 0 : 2,
    }).format(normalized)
  } catch {
    return `${normalized} ${currencyCode}`
  }
}
