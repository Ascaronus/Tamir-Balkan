import type { TranslateFn } from "@/lib/i18n/translator"

// Translate known generic names in either language. Preserve custom carrier/service
// names verbatim rather than guessing from a provider code or changing the method.
const names: Record<string, string> = {
  "standard": "standard", "standard shipping": "standard", "standard delivery": "standard", "standardna dostava": "standard",
  "express": "express", "express shipping": "express", "express delivery": "express", "ekspresna dostava": "express",
  "pickup": "pickup", "pick up": "pickup", "local pickup": "pickup", "store pickup": "pickup", "lično preuzimanje": "pickup", "licno preuzimanje": "pickup",
  "free shipping": "free", "free delivery": "free", "besplatna dostava": "free",
  "delivery": "delivery", "shipping": "delivery", "dostava": "delivery",
}

export function shippingMethodName(name: string | null | undefined, t: TranslateFn): string {
  const label = name?.trim() ?? ""
  const normalized = label.toLowerCase().replace(/\s+/g, " ")
  const key = Object.hasOwn(names, normalized) ? names[normalized] : undefined
  return key ? t(`shippingMethods.${key}`) : label || t("checkout.shipping")
}
