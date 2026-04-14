import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import testFulfillmentModule from "../../../scripts/test-fulfillment-provider"

/** Нужен только чтобы сборка положила провайдер в `.medusa/server` (см. medusa-config). */
void testFulfillmentModule

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  res.sendStatus(200);
}
