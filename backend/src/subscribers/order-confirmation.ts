import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendOrderEmail, type ReceiptOrder } from "../utils/order-email"

export default async function orderConfirmation({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  // Same serialization strategy as customer-welcome; no schema migration required.
  await db.transaction(async trx => {
    const row = await trx("order").where({ id: data.id }).whereNull("deleted_at").forUpdate().first()
    if (!row || row.is_draft_order || row.no_notification || row.status === "canceled" || !row.email || row.metadata?.tamir_order_email_sent_at) return
    const { data: orders } = await query.graph({
      entity: "order",
      // Match the native order detail projection: quantity lives on the
      // order-item detail, and totals need tax, adjustment and shipping data.
      // Direct graph queries require relation.* (HTTP field config uses *relation).
      fields: ["id", "display_id", "email", "currency_code", "total", "shipping_total",
        "items.*", "items.detail.*", "items.tax_lines.*", "items.adjustments.*",
        "shipping_methods.*", "shipping_methods.tax_lines.*", "shipping_methods.adjustments.*", "credit_lines.*"],
      filters: { id: data.id },
    }, { cache: { enable: false } })
    if (!orders[0]) throw new Error("Order email: order unavailable")
    await sendOrderEmail(orders[0] as unknown as ReceiptOrder)
    await trx("order").where({ id: data.id }).update({
      metadata: { ...row.metadata, tamir_order_email_sent_at: new Date().toISOString() },
    })
  })
}

export const config: SubscriberConfig = {
  event: "order.placed",
  context: { subscriberId: "tamir-order-confirmation" },
}
