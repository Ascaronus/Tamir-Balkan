/** Medusa v2 amounts are in major currency units. */
export function formatMoney(amount: number | null | undefined, currencyCode: string | null | undefined, locale = "sr-Latn-RS"): string {
  if (amount == null || !Number.isFinite(amount)) return "—"
  if (!currencyCode) return String(amount)
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode.toUpperCase() }).format(amount)
  } catch { return `${amount} ${currencyCode}` }
}
