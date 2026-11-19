import { readFileSync } from "node:fs"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"
import { syncCategoryLocalization } from "../utils/category-localization"

/**
 * Applies manually written storefront copy to one product category and marks it
 * `metadata.seo_locked`, so the Google machine translator stops touching its display
 * name (see prepare-english-store.ts). Written for the collection landings Google
 * flagged as "Crawled - currently not indexed": /rs/catalog/pojacanja and
 * /en/catalog/buffs are the same record with localized handles.
 *
 * Usage:
 *   SEO_DATA_FILE=src/scripts/data/seo-categories-2026-11.json npx medusa exec ./src/scripts/set-category-seo.ts        # dry run
 *   SEO_DATA_FILE=... SEO_APPLY=true npx medusa exec ./src/scripts/set-category-seo.ts                                 # write
 *
 * Data file: JSON array of
 *   { "handles": ["pojacanja", "buffs"], "name": "...", "description": "...",
 *     "en_name": "...", "en_description": "..." }
 * `handles` matches any address the category already answers to: the Medusa handle,
 * `metadata.category_handles` (sr/en) or `metadata.category_handle_aliases`.
 * `name`/`description` are sr-Latin storefront text (default row + sr-RS translation),
 * `en_*` are the English storefront translations. All fields are optional.
 *
 * Addresses never change: display-name edits leave `category_handles` alone, and the
 * storefront resolves a category by handle, not by name.
 */
type CategorySeoEntry = {
  handles: string[]
  name?: string
  description?: string
  en_name?: string
  en_description?: string
  force?: boolean
}

const LOCALES = { sr: "sr-RS", en: "en" } as const

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

/** Every address a category answers to, so the data file can name either language. */
function knownHandles(category: Record<string, any>): string[] {
  const metadata = (category.metadata || {}) as Record<string, unknown>
  const localized = metadata.category_handles as Record<string, unknown> | undefined
  const aliases = Array.isArray(metadata.category_handle_aliases) ? metadata.category_handle_aliases : []
  return [
    category.handle,
    ...Object.values(localized ?? {}),
    ...aliases,
  ].filter((value): value is string => typeof value === "string" && Boolean(value))
}

export default async function setCategorySeo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const translations = container.resolve(Modules.TRANSLATION)
  const apply = process.env.SEO_APPLY === "true"
  const dataFile = process.env.SEO_DATA_FILE
  if (!dataFile) throw new Error("Set SEO_DATA_FILE to the JSON file with category copy")
  const entries = JSON.parse(readFileSync(dataFile, "utf-8")) as CategorySeoEntry[]

  const { data } = await query.graph({
    entity: "product_category",
    fields: ["id", "name", "description", "handle", "metadata", "parent_category_id"],
    filters: {},
    pagination: { skip: 0, take: 1000 },
  })
  const categories = data as unknown as Array<Record<string, any>>

  let updated = 0, missing = 0
  for (const entry of entries) {
    const wanted = (Array.isArray(entry.handles) ? entry.handles : [])
      .map(handle => String(handle || "").trim())
      .filter(Boolean)
    if (!wanted.length) {
      logger.error("Category entry needs a non-empty handles list")
      missing++
      continue
    }
    const matches = categories.filter(category => knownHandles(category).some(handle => wanted.includes(handle)))
    if (!matches.length) {
      missing++
      logger.error(`Category not found for handles: ${wanted.join(", ")}`)
      continue
    }
    if (matches.length > 1) {
      missing++
      logger.error(`Handles ${wanted.join(", ")} match ${matches.length} categories; refusing to guess`)
      continue
    }

    const category = matches[0]
    const localized = (category.metadata?.category_handles ?? {}) as Record<string, unknown>
    const name = text(entry.name)
    const description = text(entry.description)
    const enName = text(entry.en_name)
    const enDescription = text(entry.en_description)
    if (!name && !description && !enName && !enDescription) {
      logger.warn(`Nothing to apply for ${wanted.join(", ")}`)
      continue
    }
    if (category.metadata?.seo_locked === true && !entry.force) {
      logger.info(`Category copy already applied and locked: ${wanted.join(", ")}. Pass "force": true to re-apply.`)
      continue
    }

    const preview = (value: unknown) => {
      const current = String(value ?? "").replace(/\s+/g, " ").trim()
      return current.length > 90 ? `${current.slice(0, 90)}...` : current || "(empty)"
    }
    // Stored rows, not what the storefront currently shows: sr falls back to the default row.
    const currentRows = await translations.listTranslations({ reference: "product_category", reference_id: category.id }, { take: 20 })
    logger.info(`${apply ? "Applying" : "Would apply"} category copy to ${wanted.join(", ")} (${category.id})`)
    logger.info(`  default row: name=${preview(category.name)} | description=${preview(category.description)}`)
    for (const locale of [LOCALES.sr, LOCALES.en] as const) {
      const row = currentRows.find(item => item.locale_code === locale)?.translations as Record<string, unknown> | undefined
      logger.info(`  ${locale} row: name=${preview(row?.name)} | description=${preview(row?.description)}`)
    }
    logger.info(`  addresses kept: ${Object.entries(localized).map(([locale, handle]) => `${locale}=${String(handle)}`).join(" ") || "(none)"}`)

    if (!apply) {
      updated++
      continue
    }

    await updateProductCategoriesWorkflow(container).run({
      input: {
        selector: { id: category.id },
        update: {
          ...(name ? { name } : {}),
          ...(description ? { description } : {}),
        },
      },
    })
    // The update DTO has no metadata field, so the lock and the indexed addresses are written
    // straight onto the row, the same way category-localization.ts writes category addresses.
    // Freezing category_handles first matters: syncCategoryLocalization derives a handle from
    // the display name when a locale has none, and a new address would replace an indexed URL.
    const pinnedHandles = { ...((category.metadata?.category_handles ?? {}) as Record<string, string>) }
    const pinnedAliases = new Set<string>([
      ...((Array.isArray(category.metadata?.category_handle_aliases) ? category.metadata.category_handle_aliases : []) as string[]),
    ])
    for (const [locale, fallbackIndex] of [["sr", 0], ["en", 1]] as const) {
      if (pinnedHandles[locale]) continue
      const current = wanted[fallbackIndex] || wanted[0] || String(category.handle || "")
      pinnedHandles[locale] = current
      logger.warn(`No stored ${locale} address for ${category.id}; pinned to ${current} so the rename cannot move the URL`)
    }
    await db("product_category")
      .where({ id: category.id })
      .whereNull("deleted_at")
      .update({
        metadata: {
          ...(category.metadata || {}),
          seo_locked: true,
          category_handles: pinnedHandles,
          category_handle_aliases: [...pinnedAliases],
        },
      })
    // The storefront reads localized rows, so the default row alone is not enough.
    for (const [locale, rowName, rowDescription] of [
      [LOCALES.sr, name, description],
      [LOCALES.en, enName, enDescription],
    ] as const) {
      if (!rowName && !rowDescription) continue
      const selector = { reference: "product_category", reference_id: category.id, locale_code: locale }
      const row = (await translations.listTranslations(selector, { take: 1 }))[0]
      const next = { ...(row?.translations || {}) }
      if (rowName) next.name = rowName
      if (rowDescription) next.description = rowDescription
      if (row) await translations.updateTranslations({ id: row.id, translations: next })
      else await translations.createTranslations({ ...selector, translations: next })
    }
    // Idempotent: keeps category_handles/category_handle_aliases and the localized
    // addresses of this category intact, only re-checks them.
    await syncCategoryLocalization(container, category.id)
    const after = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "handle", "metadata"],
      filters: { id: category.id },
    })
    const afterCategory = after.data?.[0] as Record<string, any> | undefined
    const afterHandles = (afterCategory?.metadata?.category_handles ?? {}) as Record<string, string>
    const moved = Object.entries(pinnedHandles).filter(([locale, handle]) => afterHandles[locale] !== handle)
    if (moved.length) {
      // Never let a display-name edit move an indexed address: put the frozen addresses back.
      await db("product_category")
        .where({ id: category.id })
        .whereNull("deleted_at")
        .update({ metadata: { ...(afterCategory?.metadata || {}), category_handles: pinnedHandles } })
      logger.error(
        `Addresses pinned back for ${category.id}: ${moved.map(([locale, handle]) => `${locale} ${afterHandles[locale]} -> ${handle}`).join(", ")}`,
      )
    }
    logger.info(`Category copy applied: ${category.id} -> ${Object.entries(pinnedHandles).map(([locale, handle]) => `${locale}=${handle}`).join(", ")}`)
    updated++
  }
  logger.info(`Category copy${apply ? "" : " (dry run)"}: ${updated} categories applied, ${missing} entries unresolved`)
}
