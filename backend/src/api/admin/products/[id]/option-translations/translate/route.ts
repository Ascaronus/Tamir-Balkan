import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { Modules } from '@medusajs/framework/utils'
import { z } from 'zod'
import { translationConfigured } from '../../../../../../utils/google-translate'

import { translateOptionTexts } from '../../../../../../utils/option-auto-translate'

const schema = z.object({ cells: z.array(z.object({ id: z.string().min(1).max(255), locale: z.enum(['sr-RS', 'en']) }).strict()).min(1).max(400) }).strict()

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== 'user') return res.status(401).json({ message: 'Войдите в админку' })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: 'Выберите поля SR/EN для перевода (до 400 полей за один запрос).' })
  if (!translationConfigured()) return res.status(503).json({ message: 'Автоперевод не настроен. Настройте GOOGLE_TRANSLATE_API_KEY на сервере, как для импорта Rozetka.' })
  const product = await req.scope.resolve(Modules.PRODUCT).retrieveProduct(req.params.id, { relations: ['options', 'options.values'] })
  const originals = new Map<string, string>()
  for (const option of product.options ?? []) {
    originals.set(option.id, option.title)
    for (const value of option.values ?? []) originals.set(value.id, value.value)
  }
  if (parsed.data.cells.some(cell => !originals.has(cell.id))) return res.status(409).json({ message: 'Опции товара изменились. Обновите переводы и повторите попытку.' })
  if (parsed.data.cells.some(cell => originals.get(cell.id)!.length > 255)) return res.status(400).json({ message: 'Исходное значение опции превышает 255 символов.' })
  try {
    const values: Record<string, string> = {}
    for (const locale of ['sr-RS', 'en'] as const) {
      const cells = parsed.data.cells.filter(cell => cell.locale === locale)
      const translated = await translateOptionTexts(cells.map(cell => originals.get(cell.id)!), locale)
      cells.forEach((cell, i) => { values[`${cell.id}:${locale}`] = translated[i] })
    }
    // Preview only. The editor's existing Save action persists reviewed cells.
    return res.json({ values })
  } catch {
    return res.status(502).json({ message: 'Не удалось перевести опции. Проверьте доступность и квоту Google Translate. Ваши поля не изменены.' })
  }
}
