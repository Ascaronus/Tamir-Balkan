import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { legacyRozetkaHandle } from '../../../../utils/rozetka-product-text'

// Only old importer-generated handles are aliases. Product data is still fetched
// through /store/products, which enforces the publishable key's sales channels.
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const handle = req.params.handle
  if (!legacyRozetkaHandle(handle)) return res.status(404).json({ handle: null })
  const db = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const product = await db('product').select('handle').whereNull('deleted_at').where('status', 'published')
    .whereRaw("metadata->>'rozetka_legacy_handle' = ?", [handle]).first()
  return product ? res.json({ handle: product.handle }) : res.status(404).json({ handle: null })
}
