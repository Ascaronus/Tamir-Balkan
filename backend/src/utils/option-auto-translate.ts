import type { MedusaContainer } from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'
import { optionLocales, optionTranslationRows, type TranslationRow } from '../shared/option-translations'
import { googleTranslate, translationConfigured } from './google-translate'

const sizeCode = /^(?:\d+(?:[.,/ -]\d+)*|[2-9]?X{0,4}[SML])$/i
export async function translateOptionTexts(texts: string[], locale: 'sr-RS' | 'en') {
  const translated = await googleTranslate(texts.filter(text => !sizeCode.test(text.trim())), locale === 'sr-RS' ? 'sr' : 'en')
  let index = 0
  const values = texts.map(text => sizeCode.test(text.trim()) ? text : translated[index++])
  if (values.some(text => !text.trim() || text.length > 255)) throw Error('INVALID_OPTION_TRANSLATION')
  return values
}

/** Fill missing native translations only; re-import must preserve reviewed text. */
export async function fillProductOptionTranslations(container: MedusaContainer, productId: string): Promise<string[]> {
  try {
    const product = await container.resolve(Modules.PRODUCT).retrieveProduct(productId, { relations: ['options', 'options.values'] })
    const rows = optionTranslationRows(product.options ?? [])
    if (!rows.length) return []
    const service = container.resolve(Modules.TRANSLATION)
    const read = (row: TranslationRow, locale: string) => service.listTranslations({ reference: row.reference, reference_id: row.id, locale_code: locale }, { take: 2 })
    const pending: { row: TranslationRow; locale: 'sr-RS' | 'en'; value: string }[] = []
    for (const { code } of optionLocales) {
      const missing: TranslationRow[] = []
      for (const row of rows) {
        const existing = (await read(row, code))[0]
        if (!String(existing?.translations?.[row.field] ?? '').trim()) missing.push(row)
      }
      if (!missing.length) continue
      if (!translationConfigured()) return ['Нет переводов опций: Google Translate не настроен. Откройте товар → «Переводы опций · SR / EN».']
      const values = await translateOptionTexts(missing.map(row => row.original), code)
      missing.forEach((row, i) => pending.push({ row, locale: code, value: values[i] }))
    }
    // Both locales are translated before any writes. Re-read to retain manual edits made during the request.
    for (const { row, locale, value } of pending) {
      const existing = (await read(row, locale))[0]
      if (String(existing?.translations?.[row.field] ?? '').trim()) continue
      const translations = { ...existing?.translations, [row.field]: value }
      if (existing) await service.updateTranslations({ id: existing.id, translations })
      else await service.createTranslations({ reference: row.reference, reference_id: row.id, locale_code: locale, translations })
    }
    return []
  } catch {
    return ['Не все переводы опций заполнены: автоперевод не завершён. Откройте товар → «Переводы опций · SR / EN» и повторите перевод.']
  }
}
