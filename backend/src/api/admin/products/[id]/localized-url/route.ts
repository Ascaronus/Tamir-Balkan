import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ProductUrlError, syncProductUrl } from "../../../../../utils/product-urls"

async function run(req: AuthenticatedMedusaRequest, res: MedusaResponse, write: boolean) {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") return res.status(401).json({ message: "Войдите в админку" })
  const body = req.body as { handle?: unknown } | undefined
  if (write && typeof body?.handle !== "string") return res.status(400).json({ message: "Укажите английский адрес товара." })
  try {
    const result = await syncProductUrl(req.scope, req.params.id, write ? (body!.handle as string).trim() : undefined)
    return result ? res.json(result) : res.status(404).json({ message: "Товар не найден" })
  } catch (error) {
    if (error instanceof ProductUrlError) return res.status(error.status).json({ message: error.message })
    throw error
  }
}
export const GET = (req: AuthenticatedMedusaRequest, res: MedusaResponse) => run(req, res, false)
export const POST = (req: AuthenticatedMedusaRequest, res: MedusaResponse) => run(req, res, true)
