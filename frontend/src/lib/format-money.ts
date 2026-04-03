/** Форматирование цены для витрины (Medusa отдаёт сумму в основных единицах валюты). */
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
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: code === "RSD" ? 0 : 2,
    }).format(amount)
  } catch {
    return `${amount} ${currencyCode}`
  }
}
