import type { Knex } from "knex"

// Read only. Scope sales to this storefront and region; never return order data.
export function popularityQuery(db: Knex, productIds: string[], channelIds: string[], regionId: string) {
  return db("order as o")
    .join("order_item as oi", function () { this.on("oi.order_id", "o.id").andOn("oi.version", "o.version") })
    .join("order_line_item as li", "li.id", "oi.item_id")
    .where("o.status", "completed").where("o.is_draft_order", false)
    .where("o.region_id", regionId).whereIn("o.sales_channel_id", channelIds)
    .whereIn("li.product_id", productIds)
    .whereNull("o.deleted_at").whereNull("o.canceled_at").whereNull("oi.deleted_at").whereNull("li.deleted_at")
    .groupBy("li.product_id").select("li.product_id")
    .select(db.raw("SUM(GREATEST(oi.quantity - oi.return_received_quantity - oi.written_off_quantity, 0)) AS sold_units"))
}
export async function catalogPopularity(db: Knex, ids: string[], channels: string[], region: string) {
  if (!ids.length || !channels.length) return new Map<string, number>()
  const rows = await popularityQuery(db, ids, channels, region)
  return new Map<string, number>(rows.map(row => [row.product_id, Number(row.sold_units)]))
}
