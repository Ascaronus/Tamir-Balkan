import { updateCartWorkflow } from "@medusajs/medusa/core-flows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import { clearGuestCartEmail, restoreGuestCartEmail } from "../../utils/guest-cart-email"

// Runs within updateCartWorkflow's cart lock, after Medusa's customer lookup.
updateCartWorkflow.hooks.cartUpdated(async ({ cart, additional_data }, { container }) => {
  if (additional_data?.tamir_clear_guest_email !== true) return
  const previous = await clearGuestCartEmail(container, cart.id)
  return new StepResponse(undefined, previous)
}, async (previous, { container }) => {
  if (previous) await restoreGuestCartEmail(container, previous)
})
