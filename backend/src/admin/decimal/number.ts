import { z } from "zod"

// A comma is a decimal separator, never a thousands separator. Ambiguous
// strings must fail validation instead of silently changing the amount.
export function parseDecimal(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value !== "string") return NaN
  const text = value.trim()
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return NaN
  return Number(text.replace(",", "."))
}

export const optionalDecimal = z.union([z.string(), z.number()]).optional()
  .refine(value => value === "" || value === undefined ||
    (Number.isFinite(parseDecimal(value)) && parseDecimal(value) >= 0),
  "Enter a non-negative number / Unesite nenegativan broj")

export const nullableDecimal = optionalDecimal.nullable()
  .transform(value => value == null || value === "" ? null : parseDecimal(value))

export function normalizeDecimalDraft(raw: string, previous = ""): string {
  const normalized = raw.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".")
  return /^-?\d*\.?\d*$/.test(normalized) ? normalized : previous
}
