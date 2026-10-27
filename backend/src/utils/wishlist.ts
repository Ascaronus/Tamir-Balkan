import { randomUUID } from "node:crypto"
import type { Knex } from "knex"

// Prices and stock deliberately remain in the catalog. Soft-deleted/unpublished
// products retain a removable entry; physical deletion cascades the reference.
export const wishlistSchema = `
CREATE TABLE IF NOT EXISTS tamir_customer_favorite (
 id text PRIMARY KEY,
 customer_id text NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
 product_id text NOT NULL REFERENCES product(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(customer_id, product_id)
);
CREATE INDEX IF NOT EXISTS tamir_favorite_customer_created
 ON tamir_customer_favorite(customer_id, created_at DESC, id);
`
export function validFavoriteProduct(value: unknown): value is string {
  return typeof value === "string" && /^prod_[a-zA-Z0-9]{1,100}$/.test(value)
}
export async function favoriteIds(db: Knex, customer: string): Promise<string[]> {
  const rows = await db("tamir_customer_favorite").where({ customer_id: customer })
    .orderBy("created_at", "desc").orderBy("id").select("product_id")
  return rows.map(row => row.product_id)
}
export async function saveFavorite(db: Knex, customer: string, product: string) {
  // Unique index is the concurrency boundary: retries never toggle or duplicate.
  await db("tamir_customer_favorite").insert({ id: "fav_" + randomUUID(), customer_id: customer, product_id: product })
    .onConflict(["customer_id", "product_id"]).ignore()
}
export async function removeFavorite(db: Knex, customer: string, product: string) {
  await db("tamir_customer_favorite").where({ customer_id: customer, product_id: product }).delete()
}
