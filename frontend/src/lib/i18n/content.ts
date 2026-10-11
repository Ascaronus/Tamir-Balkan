import type { Locale } from "./config"

export function localizedText(entity: { metadata?: Record<string, unknown> | null }, field: string, fallback: string, locale: Locale): string {
  const i18n = entity.metadata?.i18n as Record<string, Record<string, unknown>> | undefined
  const value = i18n?.[locale]?.[field]
  if (typeof value === "string" && value.trim()) return value
  return fallback
}

export function optionLabel(title: string, locale: Locale): string {
  const key = title.trim().toLowerCase()
  if (["size", "размер", "розмір", "veličina"].includes(key)) return locale === "sr" ? "Veličina" : "Size"
  if (["color", "colour", "цвет", "колір", "boja"].includes(key)) return locale === "sr" ? "Boja" : "Color"
  return title
}
