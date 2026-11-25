import { createHash } from "node:crypto"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * Ставит на стенд постоянный QA-набор опубликованных отзывов.
 *
 * Отзыв нужен и браузерному тесту карточки товара (счётчик, список, «развернуть»),
 * и API-тесту модерации: без единственного опубликованного отзыва эти проверки
 * приходится честно пропускать. Скрипт идемпотентен: тело отзыва начинается с
 * метки QA_FIXTURE_MARK, повторный запуск обновляет те же строки и не плодит дубли.
 *
 * Трогаются только те пары (товар, покупатель), у которых отзыва ещё нет или где
 * раньше лежал такой же QA-отзыв: реальные отзывы покупателей не перезаписываются.
 */
const QA_FIXTURE_MARK = "QA-FIXTURE"
const REVIEW_BODIES = [
  `${QA_FIXTURE_MARK} Odlično sedi, toplota i udobnost.`,
  `${QA_FIXTURE_MARK} Kvalitetan materijal, brza dostava.`,
]

function fixtureId(kind: string, seed: string) {
  return `${kind}_${createHash("sha256").update(seed).digest("hex").slice(0, 20)}`
}

export default async function seedQaReviews({ container }: ExecArgs) {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const products = (await db("product").select("id").where({ status: "published" }).whereNull("deleted_at").orderBy("created_at", "asc")).map(r => r.id as string)
  const customers = (await db("customer").select("id").whereNull("deleted_at").orderBy("created_at", "asc")).map(r => r.id as string)
  const seeded: string[] = []
  for (const [index, body] of REVIEW_BODIES.entries()) {
    const product = products[index]
    const customer = customers[index]
    if (!product || !customer) break
    const reviewId = fixtureId("rev", `${QA_FIXTURE_MARK}:${product}:${customer}`)
    // Реальный отзыв покупателя не трогаем: обновляем только свою метку или удалённый мусор.
    await db.raw(
      `INSERT INTO tamir_review (id, product_id, customer_id, name, body, rating, version, status)
       VALUES (?, ?, ?, 'QA Automation', ?, 5.0, 1, 'published')
       ON CONFLICT (product_id, customer_id) DO UPDATE
         SET name = 'QA Automation', body = EXCLUDED.body, rating = 5.0, version = 1,
             status = 'published', updated_at = now()
       WHERE tamir_review.body LIKE ? OR tamir_review.status = 'deleted'`,
      [reviewId, product, customer, body, `${QA_FIXTURE_MARK}%`],
    )
    const rows = await db("tamir_review").select("id", "status").where({ product_id: product, customer_id: customer })
    if (rows[0]?.status === "published") {
      seeded.push(`${rows[0].id} product=${product}`)
      for (const voter of customers.filter(id => id !== customer).slice(0, 2)) {
        await db.raw(
          `INSERT INTO tamir_review_vote (id, review_id, customer_id, value) VALUES (?, ?, ?, 1)
           ON CONFLICT (review_id, customer_id) DO NOTHING`,
          [fixtureId("rv", `${rows[0].id}:${voter}`), rows[0].id, voter],
        )
      }
    }
  }
  const counted = await db.raw("SELECT count(*)::int AS count FROM tamir_review WHERE status = 'published'")
  console.log(`QA reviews: seeded ${seeded.length}, published total ${counted.rows[0].count}`)
  for (const line of seeded) console.log(`  ${line}`)
}
