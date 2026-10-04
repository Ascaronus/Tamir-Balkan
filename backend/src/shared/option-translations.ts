export const optionLocales = [{ code: "sr-RS", label: "SR · Serbian (sr-RS)" }, { code: "en", label: "EN · English (en)" }] as const
export type Translation = { id: string; locale_code: string; translations: Record<string, unknown> }
export type Option = { id: string; title: string; translations?: Translation[]; values?: { id: string; value: string; translations?: Translation[] }[] }
export type TranslationRow = { id: string; original: string; reference: "product_option" | "product_option_value"; field: "title" | "value"; translations: Translation[] }
export function optionTranslationRows(options: Option[]): TranslationRow[] {
  return options.flatMap(option => [{ id: option.id, original: option.title, reference: "product_option" as const, field: "title" as const, translations: option.translations ?? [] },
    ...(option.values ?? []).map(value => ({ id: value.id, original: value.value, reference: "product_option_value" as const, field: "value" as const, translations: value.translations ?? [] }))])
}
export const cellKey = (id: string, locale: string) => `${id}:${locale}`
export function translationDraft(rows: TranslationRow[]) {
  const draft: Record<string, string> = {}
  for (const row of rows) for (const { code } of optionLocales) {
    const value = row.translations.find(t => t.locale_code === code)?.translations[row.field]
    draft[cellKey(row.id, code)] = typeof value === "string" ? value : ""
  }
  return draft
}
// Re-read before saving; edit only dirty cells and preserve unrelated fields.
export function optionTranslationPayload(rows: TranslationRow[], baseline: Record<string, string>, draft: Record<string, string>) {
  const latest = translationDraft(rows)
  const create: { reference_id: string; reference: string; locale_code: string; translations: Record<string, unknown> }[] = []
  const update: { id: string; translations: Record<string, unknown> }[] = []
  const validIds = new Set(rows.flatMap(row => optionLocales.map(({ code }) => cellKey(row.id, code))))
  for (const key of Object.keys(draft)) if (draft[key] !== baseline[key] && !validIds.has(key)) throw Error("OPTION_CHANGED")
  for (const row of rows) for (const { code } of optionLocales) {
    const key = cellKey(row.id, code), value = (draft[key] ?? "").trim()
    if (value === (baseline[key] ?? "").trim()) continue
    if (latest[key] !== baseline[key]) throw Error("TRANSLATION_CHANGED")
    if (value.length > 255) throw Error("TRANSLATION_TOO_LONG")
    const existing = row.translations.find(t => t.locale_code === code)
    if (existing) update.push({ id: existing.id, translations: { ...existing.translations, [row.field]: value } })
    else if (value) create.push({ reference_id: row.id, reference: row.reference, locale_code: code, translations: { [row.field]: value } })
  }
  return { create, update }
}

export function optionAutoTranslationCells(rows: TranslationRow[], draft: Record<string, string>, replace = false) {
  return rows.flatMap(row => optionLocales.filter(({ code }) => replace || !(draft[cellKey(row.id, code)] ?? '').trim())
    .map(({ code }) => ({ id: row.id, locale: code })))
}

export function missingOptionTranslations(options: Option[]) {
  const rows = optionTranslationRows(options), draft = translationDraft(rows)
  return Object.fromEntries(optionLocales.map(({ code }) => [code,
    rows.filter(row => !(draft[cellKey(row.id, code)] ?? "").trim()).length])) as Record<"sr-RS" | "en", number>
}
