import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"

type Contact = { id: string; email: string | null; customer_id: string | null }
export async function clearGuestCartEmail(container: MedusaContainer, id: string): Promise<Contact> {
  const carts = container.resolve(Modules.CART)
  const cart = await carts.retrieveCart(id)
  if (cart.completed_at) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cart is already completed")
  if (cart.customer_id) {
    const customer = await container.resolve(Modules.CUSTOMER).retrieveCustomer(cart.customer_id)
    if (customer.has_account) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Account checkout requires an email")
  }
  const previous = { id, email: cart.email ?? null, customer_id: cart.customer_id ?? null }
  // Detach the guest record too, so a subsequent update cannot restore its email.
  // Do not modify or delete the customer record.
  await carts.updateCarts(id, { email: null, customer_id: null })
  return previous
}
export async function restoreGuestCartEmail(container: MedusaContainer, previous: Contact) {
  await container.resolve(Modules.CART).updateCarts(previous.id, { email: previous.email, customer_id: previous.customer_id })
}
