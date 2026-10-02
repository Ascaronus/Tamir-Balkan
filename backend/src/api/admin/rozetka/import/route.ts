import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { executeImport } from "../../../../utils/rozetka-admin"
import { ImportError } from "../../../../utils/rozetka-preview"
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") return res.status(401).json({ message: "Войдите в админку" })
  try { return res.json(await executeImport(req.scope, req.body, req.auth_context.actor_id)) }
  catch (error) { return res.status(error instanceof ImportError ? error.status : 422).json({ message: error instanceof ImportError ? error.message : "Не удалось импортировать товар. Проверьте настройки и журнал сервера.", ...(error instanceof ImportError && error.product_id ? { product_id: error.product_id } : {}) }) }
}
