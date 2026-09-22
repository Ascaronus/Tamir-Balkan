import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendRegistrationEmail } from "../utils/registration-email"

export default async function customerWelcome({ event: { data }, container }: SubscriberArgs<{ id: string }>) {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  // Lock the customer so concurrent deliveries of the event do not send twice.
  await db.transaction(async (trx) => {
    const customer = await trx("customer").where({ id: data.id }).whereNull("deleted_at").forUpdate().first()
    if (!customer?.has_account || !customer.email || customer.metadata?.tamir_welcome_sent_at) return
    await sendRegistrationEmail(customer)
    await trx("customer").where({ id: customer.id }).update({
      metadata: { ...customer.metadata, tamir_welcome_sent_at: new Date().toISOString() },
    })
  })
}

export const config: SubscriberConfig = {
  event: "customer.created",
  context: { subscriberId: "tamir-customer-welcome" },
}
