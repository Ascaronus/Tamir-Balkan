import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { previewImport } from "../../../utils/rozetka-admin"
import { sourceSchema, ImportError } from "../../../utils/rozetka-preview"
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") return res.status(401).json({ message: "Войдите в админку" })
  try { return res.json(await previewImport(req.scope, req.query.refresh === "true")) }
  catch (error) { return res.status(error instanceof ImportError ? error.status : 502).json({ message: error instanceof ImportError ? error.message : "Не удалось загрузить XML или настройки магазина. Попробуйте ещё раз." }) }
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") return res.status(401).json({ message: "Войдите в админку" })
  const parsed = sourceSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Укажите ссылку на XML или выберите XML-файл до 10 МБ" })
  try { return res.json(await previewImport(req.scope, true, parsed.data)) }
  catch (error) { return res.status(error instanceof ImportError ? error.status : 502).json({ message: error instanceof ImportError ? error.message : "Не удалось прочитать XML. Проверьте ссылку или файл и повторите загрузку." }) }
}
