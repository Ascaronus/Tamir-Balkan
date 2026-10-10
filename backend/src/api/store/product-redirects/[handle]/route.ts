import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { legacyRozetkaHandle } from '../../../../utils/rozetka-product-text'

// English addresses and old importer-generated handles resolve to the same product. Data is fetched
// through /store/products, which enforces the publishable key's sales channels.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const handle = req.params.handle
  if (handle.length > 255) return res.status(404).json({ handle: null })
  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const localized = await db('tamir_product_url as u').join('product as p', 'p.id', 'u.product_id')
    .where('u.handle', handle).whereNull('p.deleted_at').where('p.status', 'published').select('p.handle').first()
  if (localized) return res.json({ handle: localized.handle })
  if (!legacyRozetkaHandle(handle)) return res.status(404).json({ handle: null })
  const product = await db('product').select('handle').whereNull('deleted_at').where('status', 'published')
    .whereRaw("metadata->>'rozetka_legacy_handle' = ?", [handle]).first()
  return product ? res.json({ handle: product.handle }) : res.status(404).json({ handle: null })
}
