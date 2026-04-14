import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import testFulfillmentModule from "../../../scripts/test-fulfillment-provider"

/** Side-effect: чтобы `test-fulfillment-provider` попал в `.medusa/server` (resolve в medusa-config — абсолютный путь к этому файлу). */
void testFulfillmentModule

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  res.sendStatus(200);
}
