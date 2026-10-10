import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { DEFAULT_XML_URL } from "../../../../shared/rozetka-import"
import { ImportError, sourceUrl } from "../../../../utils/rozetka-preview"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") return res.status(401).json({ message: "Войдите в админку" })
  const [store] = await req.scope.resolve(Modules.STORE).listStores()
  return res.json({ source_url: store?.metadata?.rozetka_source_url || DEFAULT_XML_URL })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "no-store")
  if (!req.auth_context?.actor_id || req.auth_context.actor_type !== "user") return res.status(401).json({ message: "Войдите в админку" })
  try {
    const input = (req.body as { source_url?: unknown })?.source_url
    if (typeof input !== "string" || input.length > 2048) throw new ImportError(400, "Укажите корректный адрес XML")
    const url = sourceUrl(input.trim())
    const service = req.scope.resolve(Modules.STORE)
    const [store] = await service.listStores()
    if (!store) throw new ImportError(404, "Магазин не найден")
    await service.updateStores(store.id, { metadata: { ...store.metadata, rozetka_source_url: url } })
    return res.json({ source_url: url })
  } catch (error) {
    if (error instanceof ImportError) return res.status(error.status).json({ message: error.message })
    throw error
  }
}
