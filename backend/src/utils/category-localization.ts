import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { categoryNames } from "./category-names"
import { googleTranslate, translationConfigured } from "./google-translate"
import { productSlug } from "./rozetka-product-text"

/** Migrate legacy display names to the same records edited by Manage translations. */
export async function syncCategoryLocalization(container: MedusaContainer, id: string, fillMissing = false) {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const category = await db("product_category").where({ id }).whereNull("deleted_at").first()
  if (!category) return
  const service = container.resolve(Modules.TRANSLATION)
  if (fillMissing) {
    for (const locale of ["sr", "en"] as const) {
      const locale_code = locale === "sr" ? "sr-RS" : "en"
      const selector = { reference: "product_category", reference_id: id, locale_code }
      const current = (await service.listTranslations(selector, { take: 1 }))[0]
      if (String(current?.translations?.name ?? "").trim()) continue
      const legacy = category.metadata?.i18n?.[locale]?.name
      const generic = locale === "sr" ? (await service.listTranslations({ ...selector, locale_code: "sr" }, { take: 1 }))[0]?.translations?.name : undefined
      let name = String(generic || legacy || categoryNames[category.name.trim().toLowerCase()]?.[locale] || "").trim()
      if (!name && translationConfigured()) [name] = await googleTranslate([category.name], locale)
      if (!name) continue
      // Keep an admin edit made while the provider request was running.
      const latest = (await service.listTranslations(selector, { take: 1 }))[0]
      if (String(latest?.translations?.name ?? "").trim()) continue
      const translations = { ...latest?.translations, name }
      if (latest) await service.updateTranslations({ id: latest.id, translations })
      else await service.createTranslations({ ...selector, translations })
    }
  }
  const rows = await service.listTranslations({ reference: "product_category", reference_id: id }, { take: 100 })
  // Reserve slugs across both languages and original handles, including deleted categories.
  // Stable metadata means renaming a display name does not break an indexed URL.
  await db.transaction(async trx => {
    await trx.raw("SELECT pg_advisory_xact_lock(67195053, 1)")
    const fresh = await trx("product_category").where({ id }).whereNull("deleted_at").forUpdate().first()
    if (!fresh) return
    const all = await trx("product_category").select("id", "handle", "metadata")
    const occupied = new Set<string>(all.filter(c => c.id !== id).flatMap(c => [c.handle, ...Object.values(c.metadata?.category_handles ?? {}), ...(c.metadata?.category_handle_aliases ?? [])]).filter((v): v is string => typeof v === "string"))
    const handles = { ...fresh.metadata?.category_handles }
    for (const locale of ["sr", "en"] as const) {
      if (handles[locale]) continue
      const name = rows.find(r => r.locale_code === (locale === "sr" ? "sr-RS" : "en"))?.translations?.name
      if (typeof name !== "string" || !name.trim()) continue
      const base = productSlug(name)
      if (!base) continue
      let handle = base
      for (let n = 2; occupied.has(handle); n++) handle = `${base}-${n}`
      handles[locale] = handle
    }
    const aliases = [...new Set([...(fresh.metadata?.category_handle_aliases ?? []), fresh.handle].filter(Boolean))]
    await trx("product_category").where({ id }).update({ metadata: { ...fresh.metadata, category_handles: handles, category_handle_aliases: aliases } })
  })
}

export async function prepareCategoryLocalizations(container: MedusaContainer) {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const categories = await db("product_category").whereNull("deleted_at").select("id").orderBy("id")
  for (const category of categories) await syncCategoryLocalization(container, category.id, true)
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`Category translations and URLs ready: ${categories.length}`)
}
