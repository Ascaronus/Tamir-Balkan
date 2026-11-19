import { readFileSync } from "node:fs"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { syncProductUrl } from "../utils/product-urls"

/**
 * Applies manually written storefront copy by product handle and marks the product
 * `metadata.seo_locked`, so the Rozetka normalize script and the Google machine
 * translator stop overwriting it (see normalize-rozetka-products.ts and
 * prepare-english-store.ts). Use it for the color-twin pages Google flagged as
 * "Crawled - currently not indexed".
 *
 * Usage:
 *   SEO_DATA_FILE=src/scripts/data/seo-twins-2026-11.json npx medusa exec ./src/scripts/set-product-seo.ts            # dry run
 *   SEO_DATA_FILE=... SEO_APPLY=true npx medusa exec ./src/scripts/set-product-seo.ts                                 # write
 *
 * Data file: JSON array of
 *   { "handle": "...", "title": "...", "description": "...", "en_title": "...", "en_description": "..." }
 * `title`/`description` are sr-Latin storefront text (default fields + sr-RS translation row),
 * `en_*` are the English storefront translations. All fields are optional; missing ones are left alone.
 * Re-running the same file is free: a product that already carries seo_locked is skipped, so the
 * deploy step is idempotent. Add "force": true to an entry to rewrite it on purpose.
 */
type SeoEntry = {
  handle: string
  title?: string
  description?: string
  en_title?: string
  en_description?: string
  force?: boolean
}

export default async function setProductSeo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const translations = container.resolve(Modules.TRANSLATION)
  const apply = process.env.SEO_APPLY === "true"
  const dataFile = process.env.SEO_DATA_FILE
  if (!dataFile) throw new Error("Set SEO_DATA_FILE to the JSON file with product copy")
  const entries = JSON.parse(readFileSync(dataFile, "utf-8")) as SeoEntry[]

  let updated = 0, missing = 0
  for (const entry of entries) {
    const handle = String(entry.handle || "").trim()
    if (!handle) continue
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "description", "handle", "metadata", "status"],
      filters: { handle },
    })
    const product = data[0] as Record<string, any> | undefined
    if (!product) {
      missing++
      logger.error(`Product not found for handle: ${handle}`)
      continue
    }

    const defaultTitle = typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : undefined
    const defaultDescription = typeof entry.description === "string" && entry.description.trim() ? entry.description.trim() : undefined
    const enTitle = typeof entry.en_title === "string" && entry.en_title.trim() ? entry.en_title.trim() : undefined
    const enDescription = typeof entry.en_description === "string" && entry.en_description.trim() ? entry.en_description.trim() : undefined
    if (!defaultTitle && !defaultDescription && !enTitle && !enDescription) {
      logger.warn(`Nothing to apply for ${handle}`)
      continue
    }

    if (product.metadata?.seo_locked === true && !entry.force) {
      logger.info(`Copy already applied and locked: ${handle}. Pass "force": true to re-apply.`)
      continue
    }
    const metadata = { ...(product.metadata || {}), seo_locked: true }
    const pinnedEnHandle = typeof product.metadata?.en_handle === "string" && product.metadata.en_handle ? String(product.metadata.en_handle) : undefined
    logger.info(`${apply ? "Applying" : "Would apply"} SEO copy to ${handle}: sr=${defaultTitle ? "title " : ""}${defaultDescription ? "description " : ""}| en=${enTitle ? "title " : ""}${enDescription ? "description " : ""}| en_handle=${pinnedEnHandle || "(none)"}`)
    if (enTitle && !pinnedEnHandle) {
      logger.warn(`${handle}: no metadata.en_handle to pin the EN address, syncProductUrl will derive it from the EN title (${enTitle})`)
    }

    if (apply) {
      await updateProductsWorkflow(container).run({
        input: {
          products: [{
            id: product.id,
            ...(defaultTitle ? { title: defaultTitle } : {}),
            ...(defaultDescription ? { description: defaultDescription } : {}),
            metadata,
          }],
        },
      })
      // The sr storefront reads through the sr-RS translation row (see normalize-rozetka-products.ts).
      for (const [localeCode, title, description] of [["sr-RS", defaultTitle, defaultDescription], ["en", enTitle, enDescription]] as const) {
        if (!title && !description) continue
        const row = (await translations.listTranslations({ reference: "product", reference_id: product.id, locale_code: localeCode }, { take: 1 }))[0]
        const next = { ...(row?.translations || {}) }
        if (title) next.title = title
        if (description) next.description = description
        if (row) await translations.updateTranslations({ id: row.id, translations: next })
        else await translations.createTranslations({ reference: "product", reference_id: product.id, locale_code: localeCode, translations: next })
      }
      // Refresh the EN storefront gate so a completed page leaves the noindex list right away.
      // Pin the address the EN page already answers to: syncProductUrl would otherwise derive a
      // new one from the new EN title and move an indexed URL.
      const sync = await syncProductUrl(container, product.id, pinnedEnHandle)
      if (pinnedEnHandle && sync?.handle && sync.handle !== pinnedEnHandle) {
        logger.error(`EN address changed for ${handle}: ${pinnedEnHandle} -> ${sync.handle}`)
      }
      logger.info(`SEO copy applied: ${handle} (${product.id}), en_handle=${sync?.handle || "(none)"}, en_ready=${Boolean(sync?.ready)}`)
    }
    updated++
  }
  logger.info(`SEO copy${apply ? "" : " (dry run)"}: ${updated} products applied, ${missing} handles not found`)
}
