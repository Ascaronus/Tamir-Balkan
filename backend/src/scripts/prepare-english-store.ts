import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { googleTranslate, translationConfigured } from "../utils/google-translate"
import { syncProductUrl } from "../utils/product-urls"
import { fillProductOptionTranslations } from "../utils/option-auto-translate"
import { prepareCategoryLocalizations } from "../utils/category-localization"

/** Idempotent backfill. Keep reviewed translations and stable addresses; never change commerce data. */
export default async function prepareEnglishStore({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(Modules.TRANSLATION)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  await prepareCategoryLocalizations(container)
  let ready = 0, missing = 0, changed = 0
  for (const reference of ["product", "product_category"] as const) {
    for (let skip = 0; ; skip += 100) {
      const { data } = await query.graph({ entity: reference, fields: reference === "product" ? ["id", "title", "description", "status"] : ["id", "name"], pagination: { skip, take: 100, order: { id: "ASC" } } })
      for (const entity of data as unknown as Record<string, any>[]) {
        const rows = await service.listTranslations({ reference, reference_id: entity.id, locale_code: "en" }, { take: 1 })
        const fields = reference === "product" ? ["title", "description"] : ["name"]
        const pending = fields.filter(field => String(entity[field] ?? "").trim() && (!String(rows[0]?.translations?.[field] ?? "").trim() || /[\u0400-\u04ff]/.test(String(rows[0]?.translations?.[field]))))
        if (pending.length && translationConfigured()) {
          try {
            const translated = await googleTranslate(pending.map(field => String(entity[field])), "en")
            // A user may have edited the translation during the provider request.
            const current = (await service.listTranslations({ reference, reference_id: entity.id, locale_code: "en" }, { take: 1 }))[0]
            const translations = { ...current?.translations }
            pending.forEach((field, i) => { if (current?.translations?.[field] === rows[0]?.translations?.[field]) translations[field] = translated[i] })
            if (current) await service.updateTranslations({ id: current.id, translations })
            else await service.createTranslations({ reference, reference_id: entity.id, locale_code: "en", translations })
            changed++
          } catch { logger.warn(`EN translation pending: ${reference} ${entity.id}`) }
        }
        if (reference === "product") {
          const result = await syncProductUrl(container, entity.id)
          if (result?.ready) ready++; else { missing++; logger.warn(`EN content incomplete: ${entity.id}`) }
          for (const warning of await fillProductOptionTranslations(container, entity.id)) logger.warn(`${entity.id}: ${warning}`)
        }
      }
      if (data.length < 100) break
    }
  }
  logger.info(`English storefront ready: ${ready} products, ${missing} incomplete, ${changed} translation records filled`)
}
