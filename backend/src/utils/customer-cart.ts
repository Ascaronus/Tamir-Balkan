import type { AuthenticatedMedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createCartWorkflow, transferCartCustomerWorkflow } from "@medusajs/core-flows"
import type { Knex } from "knex"

// Only a successful authenticated restore/claim can write this ownership record.
// Medusa customer_id alone is insufficient: guest checkout can link it by email.
export const customerCartSchema = `
CREATE TABLE IF NOT EXISTS tamir_customer_cart (
 cart_id text PRIMARY KEY REFERENCES cart(id) ON DELETE CASCADE,
 customer_id text NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tamir_customer_cart_owner ON tamir_customer_cart(customer_id);
`

export class CustomerCartError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
export async function cartAccount(req: AuthenticatedMedusaRequest) {
  const id = req.auth_context?.actor_type === "customer" ? req.auth_context.actor_id : undefined
  if (!id) throw new CustomerCartError(401, "LOGIN_REQUIRED")
  const customer = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(id)
  if (!customer.has_account || customer.deleted_at) throw new CustomerCartError(401, "LOGIN_REQUIRED")
  return id
}
export function cartFailure(error: unknown, res: MedusaResponse) {
  return error instanceof CustomerCartError
    ? res.status(error.status).json({ code: error.code })
    : res.status(503).json({ code: "CART_UNAVAILABLE" })
}
export async function restoreCustomerCart(req: AuthenticatedMedusaRequest) {
  const owner = await cartAccount(req)
  const body = req.body as Record<string, unknown> | undefined
  if (!body || Array.isArray(body) || Object.keys(body).some(k => !["region_id", "country_code", "guest_cart_id"].includes(k)) ||
      typeof body.region_id !== "string" || !/^reg_[a-zA-Z0-9]+$/.test(body.region_id) ||
      typeof body.country_code !== "string" || !/^[a-z]{2}$/.test(body.country_code) ||
      (body.guest_cart_id != null && (typeof body.guest_cart_id !== "string" || !/^cart_[a-zA-Z0-9]{1,150}$/.test(body.guest_cart_id)))) {
    throw new CustomerCartError(400, "INVALID_BODY")
  }
  const regionId = body.region_id, country = body.country_code, guestId = body.guest_cart_id as string | undefined
  const channels = req.publishable_key_context?.sales_channel_ids ?? []
  if (channels.length !== 1) throw new CustomerCartError(400, "CART_SALES_CHANNEL_REQUIRED")
  const channel = channels[0]
  const db = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)
  // PostgreSQL locks serialize restore/create across workers and simultaneous logins.
  return db.transaction(async tx => {
    await tx.raw("select pg_advisory_xact_lock(hashtext(?))", [`customer-cart:${owner}:${regionId}:${channel}`])
    if (guestId) await tx.raw("select pg_advisory_xact_lock(hashtext(?))", [`customer-cart-claim:${guestId}`])
    const existing = await tx("cart").join("tamir_customer_cart", "cart.id", "tamir_customer_cart.cart_id")
      .where({ "tamir_customer_cart.customer_id": owner, "cart.customer_id": owner, "cart.region_id": regionId, "cart.sales_channel_id": channel })
      .whereNull("cart.completed_at").whereNull("cart.deleted_at").orderBy("cart.created_at", "desc").orderBy("cart.id", "desc").first("cart.id")
    if (existing) return { cart_id: existing.id, claimed_guest: existing.id === guestId }
    if (guestId) {
      const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "cart",
        fields: ["id", "completed_at", "region_id", "sales_channel_id", "customer_id", "customer.has_account"], filters: { id: guestId } }, { cache: { enable: false } })
      const guest = data[0]
      const claim = await tx("tamir_customer_cart").where({ cart_id: guestId }).first("customer_id")
      if ((!claim || claim.customer_id === owner) && guest && !guest.completed_at && guest.region_id === regionId && guest.sales_channel_id === channel && (!guest.customer?.has_account || guest.customer_id === owner)) {
        await transferCartCustomerWorkflow(req.scope).run({ input: { id: guest.id, customer_id: owner } })
        await tx("tamir_customer_cart").insert({ cart_id: guest.id, customer_id: owner }).onConflict("cart_id").ignore()
        return { cart_id: guest.id, claimed_guest: true }
      }
    }
    const { result } = await createCartWorkflow(req.scope).run({ input: { customer_id: owner, region_id: regionId, sales_channel_id: channel, shipping_address: { country_code: country } } })
    await tx("tamir_customer_cart").insert({ cart_id: result.id, customer_id: owner })
    return { cart_id: result.id, claimed_guest: false }
  })
}

/** A registered customer's cart is no longer a public capability after it is claimed. */
export async function protectCustomerCart(req: AuthenticatedMedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  try {
    const path = decodeURIComponent(req.originalUrl.split("?")[0])
    const id = path.match(/^\/store\/carts\/(cart_[a-zA-Z0-9]+)(?:\/|$)/)?.[1]
    if (!id) return next()
    const db = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION)
    const claim = await db("tamir_customer_cart").where({ cart_id: id }).first("customer_id")
    if (claim) {
      res.setHeader("Cache-Control", "private, no-store")
      const owner = await cartAccount(req)
      if (owner !== claim.customer_id) throw new CustomerCartError(404, "CART_NOT_FOUND")
    }
    return next()
  } catch (error) { return cartFailure(error, res) }
}
