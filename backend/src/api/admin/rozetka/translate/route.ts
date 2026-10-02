import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "zod"
import { plainText } from "../../../../utils/rozetka-preview"
const schema = z.object({ title: z.string().min(1).max(255), description: z.string().max(15000) }).strict()
function latin(text: string) {
  const cyr = "абвгдђежзијклљмнњопрстћуфхцчџш", lat = ["a", "b", "v", "g", "d", "đ", "e", "ž", "z", "i", "j", "k", "l", "lj", "m", "n", "nj", "o", "p", "r", "s", "t", "ć", "u", "f", "h", "c", "č", "dž", "š"]
  return [...text].map(c => { const i = cyr.indexOf(c.toLowerCase()); if (i < 0) return c; const s = lat[i]; return c === c.toLowerCase() ? s : s[0].toUpperCase() + s.slice(1) }).join("")
}
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") return res.status(401).json({ message: "Войдите в админку" })
  const data = schema.safeParse(req.body), key = process.env.GOOGLE_TRANSLATE_API_KEY
  if (!data.success) return res.status(400).json({ message: "Проверьте название и описание (до 15 000 символов для автоперевода)" })
  if (!key || key === "YOUR_GOOGLE_KEY") return res.status(503).json({ message: "Автоперевод не настроен. Заполните SR/EN вручную или настройте GOOGLE_TRANSLATE_API_KEY на сервере." })
  try {
    const result: Record<string, string> = {}
    for (const locale of ["sr", "en"]) {
      const response = await fetch("https://translation.googleapis.com/language/translate/v2", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key }, signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ q: [data.data.title, data.data.description || " "], target: locale, format: "text" }),
      })
      if (!response.ok) throw Error("TRANSLATION_FAILED")
      const json = await response.json(), rows = json?.data?.translations
      if (!Array.isArray(rows) || rows.length !== 2 || !rows[0]?.translatedText) throw Error("TRANSLATION_FAILED")
      const normalize = (v: string) => locale === "sr" ? latin(plainText(v)) : plainText(v)
      result[`title_${locale}`] = normalize(rows[0].translatedText)
      result[`description_${locale}`] = normalize(rows[1]?.translatedText || "")
    }
    return res.json(result)
  } catch { return res.status(502).json({ message: "Сервис перевода не ответил. Ваш текст не изменён; можно заполнить перевод вручную." }) }
}
