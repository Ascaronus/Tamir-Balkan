import type { Locale } from "./config"

const categoryNames: Record<string, { en: string; sr: string }> = {
  sweatshirts: { en: "Sweatshirts", sr: "Dukserice" }, merch: { en: "Merch", sr: "Brendirani proizvodi" },
  suite: { en: "Suits", sr: "Odela" }, suits: { en: "Suits", sr: "Odela" }, trousers: { en: "Trousers", sr: "Pantalone" },
  accessories: { en: "Accessories", sr: "Aksesoari" }, shoes: { en: "Shoes", sr: "Obuća" }, tie: { en: "Tie", sr: "Kravata" },
  "bow tie": { en: "Bow tie", sr: "Leptir mašna" }, knitwear: { en: "Knitwear", sr: "Trikotaža" },
  jackets: { en: "Jackets", sr: "Jakne" }, belts: { en: "Belts", sr: "Kaiševi" }, cufflinks: { en: "Cufflinks", sr: "Dugmad za manžetne" },
  "tie clips": { en: "Tie clips", sr: "Igle za kravatu" }, turtleneck: { en: "Turtleneck", sr: "Rolka" }, sweater: { en: "Sweater", sr: "Džemper" },
  "bow ties": { en: "Bow ties", sr: "Leptir mašne" },
  ties: { en: "Ties", sr: "Kravate" }, hats: { en: "Hats", sr: "Kape" },
  scarves: { en: "Scarves", sr: "Šalovi" }, pants: { en: "Pants", sr: "Pantalone" },
  vests: { en: "Vests", sr: "Prsluci" }, blazers: { en: "Blazers", sr: "Sakoi" },
  shirts: { en: "Shirts", sr: "Košulje" }, "accessory sets": { en: "Accessory sets", sr: "Setovi aksesoara" },
  "boys clothing": { en: "Boys clothing", sr: "Odeća za dečake" }, other: { en: "Other", sr: "Ostalo" },
}

export function localizedText(entity: { metadata?: Record<string, unknown> | null }, field: string, fallback: string, locale: Locale): string {
  const i18n = entity.metadata?.i18n as Record<string, Record<string, unknown>> | undefined
  const value = i18n?.[locale]?.[field]
  if (typeof value === "string" && value.trim()) return value
  if (field === "name") return categoryNames[fallback.trim().toLowerCase()]?.[locale] ?? fallback
  return fallback
}

export function optionLabel(title: string, locale: Locale): string {
  const key = title.trim().toLowerCase()
  if (["size", "размер", "розмір", "veličina"].includes(key)) return locale === "sr" ? "Veličina" : "Size"
  if (["color", "colour", "цвет", "колір", "boja"].includes(key)) return locale === "sr" ? "Boja" : "Color"
  return title
}
