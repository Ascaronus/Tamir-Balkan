import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'

// Resolve only a live product's current English address. Historical aliases and
// deleted imports are not replacements. The subsequent Store products query
// still enforces the publishable key's sales channels.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const handle = req.params.handle
  if (handle.length > 255) return res.status(404).json({ handle: null })
  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const localized = await db('tamir_product_url as u').join('product as p', 'p.id', 'u.product_id')
    .where('u.handle', handle).where('u.is_current', true)
    .whereNull('p.deleted_at').where('p.status', 'published').select('p.handle').first()
  return localized ? res.json({ handle: localized.handle }) : res.status(404).json({ handle: null })
}
