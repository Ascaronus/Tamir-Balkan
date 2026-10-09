import { syncProductUrl } from "../utils/product-urls"
import type { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { updateProductsWorkflow } from '@medusajs/medusa/core-flows'
import { importedProducts, withImportLock } from '../utils/rozetka-admin'
import { legacyRozetkaHandle, rozetkaProductHandle } from '../utils/rozetka-product-text'

/** One-time, resumable text/URL repair. Never touches prices, variants, stock or status. */
export default async function normalizeRozetkaProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const apply = process.env.ROZETKA_NORMALIZE_APPLY === 'true'
  await withImportLock(container, async () => {
    const products = await importedProducts(container)
    const translations = container.resolve(Modules.TRANSLATION)
    let changed = 0
    for (const product of products) {
      const metadata = product.metadata || {}
      if (!metadata.rozetka_admin_key || metadata.rozetka_admin_import?.state !== 'complete' || metadata.rozetka_text_version === 1) continue
      const rows = await translations.listTranslations({ reference: 'product', reference_id: product.id, locale_code: 'sr-RS' }, { take: 1 })
      const fields = rows[0]?.translations as Record<string, unknown> | undefined
      const title = typeof fields?.title === 'string' && fields.title.trim() ? fields.title.trim() : product.title
      const description = typeof fields?.description === 'string' && fields.description.trim() ? fields.description : product.description
      const handle = rozetkaProductHandle(title, metadata.rozetka_admin_key, products, product)
      const nextMetadata = { ...metadata, rozetka_text_version: 1,
        rozetka_original_text: metadata.rozetka_original_text || { title: product.title, description: product.description },
        ...(legacyRozetkaHandle(product.handle) && handle !== product.handle ? { rozetka_legacy_handle: product.handle } : {}),
      }
      logger.info(`${apply ? 'Repairing' : 'Would repair'} ${product.id}: ${product.handle} -> ${handle}`)
      if (apply) await updateProductsWorkflow(container).run({ input: { products: [{ id: product.id, title, description, handle, metadata: nextMetadata }] } })
      Object.assign(product, { title, description, handle, metadata: nextMetadata })
      changed++
    }
    if (apply) {
      let ready = 0, missing = 0
      for (const product of products) {
        const result = await syncProductUrl(container, product.id)
        if (result?.ready) ready++; else missing++
      }
      logger.info(`English URLs: ${ready} translated products, ${missing} need EN content`)
    }
    logger.info(`Rozetka text/URL repair: ${changed} products${apply ? '' : ' (dry run)'}`)
  })
}
