import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { cartFailure, restoreCustomerCart } from "../../../utils/customer-cart"
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  res.setHeader("Cache-Control", "private, no-store")
  try { return res.json(await restoreCustomerCart(req)) }
  catch (error) { return cartFailure(error, res) }
}
