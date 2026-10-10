import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { productSlug } from "./rozetka-product-text"

export const productUrlSchema = `
CREATE TABLE IF NOT EXISTS tamir_product_url (
  handle text PRIMARY KEY,
  product_id text NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tamir_product_url_current ON tamir_product_url(product_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS tamir_product_url_product ON tamir_product_url(product_id);
`
export class ProductUrlError extends Error { status = 409 }

/** Native EN translations are required. Never silently label the source language as English. */
export function englishProductText(fields: Record<string, unknown> | null | undefined) {
  const title = typeof fields?.title === "string" ? fields.title.trim() : ""
  const description = typeof fields?.description === "string" ? fields.description.trim() : ""
  return { title, ready: Boolean(title && description && !/[\u0400-\u04ff]/.test(title + description)) }
}

/** One transaction reserves an address, keeps old aliases, and updates link metadata. */
export async function syncProductUrl(container: MedusaContainer, id: string, requested?: string) {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  return db.transaction(async trx => {
    await trx.raw("SELECT pg_advisory_xact_lock(67195052, 1)")
    const product = await trx("product").where({ id }).whereNull("deleted_at").forUpdate().first()
    if (!product) return null
    const rows = await container.resolve(Modules.TRANSLATION).listTranslations(
      { reference: "product", reference_id: id, locale_code: "en" }, { take: 1 })
    const { title, ready } = englishProductText(rows[0]?.translations)
    const current = await trx("tamir_product_url").where({ product_id: id, is_current: true }).first()
    let handle: string | undefined = current?.handle
    if (requested !== undefined) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requested) || requested.length > 150) throw new ProductUrlError("Используйте латинские буквы a–z, цифры и дефисы, до 150 символов.")
      handle = requested
    } else if (!handle && title && !/[\u0400-\u04ff]/.test(title)) {
      const base = productSlug(title)
      if (base) {
        handle = base
        for (let n = 2; await occupied(handle); n++) handle = `${base}-${n}`
      }
    }
    async function occupied(value: string) {
      const alias = await trx("tamir_product_url").where({ handle: value }).whereNot({ product_id: id }).first()
      const other = await trx("product").whereNot({ id }).whereNull("deleted_at").where(q => q.where({ handle: value }).orWhereRaw("metadata->>'rozetka_legacy_handle' = ?", [value])).first()
      return Boolean(alias || other)
    }
    if (handle && await occupied(handle)) throw new ProductUrlError("Этот адрес уже используется другим товаром или его старой ссылкой.")
    if (handle && handle !== current?.handle) {
      await trx("tamir_product_url").where({ product_id: id, is_current: true }).update({ is_current: false })
      await trx("tamir_product_url").insert({ handle, product_id: id, is_current: true }).onConflict("handle").merge({ is_current: true })
    }
    // Update only our keys; preserve concurrent importer/admin metadata and do not emit an update loop.
    await trx("product").where({ id }).update({ metadata: { ...product.metadata, en_handle: handle ?? null, en_content_ready: ready } })
    return { handle: handle ?? "", ready, title }
  })
}
