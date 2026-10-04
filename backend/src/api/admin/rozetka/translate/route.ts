import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { googleTranslate, translationConfigured } from "../../../../utils/google-translate"
const schema = z.object({ title: z.string().min(1).max(255), description: z.string().max(15000) }).strict()
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") return res.status(401).json({ message: "Войдите в админку" })
  const data = schema.safeParse(req.body)
  if (!data.success) return res.status(400).json({ message: "Проверьте название и описание (до 15 000 символов для автоперевода)" })
  if (!translationConfigured()) return res.status(503).json({ message: "Автоперевод не настроен. Заполните SR/EN вручную или настройте GOOGLE_TRANSLATE_API_KEY на сервере." })
  try {
    const result: Record<string, string> = {}
    for (const locale of ["sr", "en"] as const) {
      const [title, description] = await googleTranslate([data.data.title, data.data.description], locale)
      result[`title_${locale}`] = title
      result[`description_${locale}`] = description
    }
    return res.json(result)
  } catch { return res.status(502).json({ message: "Сервис перевода не ответил. Ваш текст не изменён; можно заполнить перевод вручную." }) }
}
