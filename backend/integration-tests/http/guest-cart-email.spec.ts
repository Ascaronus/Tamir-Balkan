import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createCartWorkflow, createRegionsWorkflow } from "@medusajs/medusa/core-flows"

jest.setTimeout(120000)
medusaIntegrationTestRunner({ inApp: true, env: {}, testSuite: ({ api, getContainer }) => {
  describe("guest checkout email over HTTP", () => {
    it("clears a previously entered guest email and customer link without restoring it on the next update", async () => {
      const container = getContainer()
      const { result: [region] } = await createRegionsWorkflow(container).run({ input: { regions: [{ name: "Guest checkout test", currency_code: "eur", countries: ["rs"] }] } })
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
      const { data: keys } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
      const { result: cart } = await createCartWorkflow(container).run({ input: { region_id: region.id, sales_channel_id: channels[0].id, email: "guest@example.test" } })
      const headers = { "x-publishable-api-key": keys[0].token }
      const response = await api.post(`/store/carts/${cart.id}`, { additional_data: { tamir_clear_guest_email: true } }, { headers })
      expect(response.status).toBe(200)
      expect(response.data.cart.email).toBeNull()
      expect(response.data.cart.customer_id).toBeNull()
      const next = await api.post(`/store/carts/${cart.id}`, { metadata: { notes: "phone contact" } }, { headers })
      expect(next.data.cart.email).toBeNull()
      const saved = await container.resolve(Modules.CART).retrieveCart(cart.id)
      expect(saved.email).toBeNull()
      expect(saved.customer_id).toBeNull()
    })
  })
} })
