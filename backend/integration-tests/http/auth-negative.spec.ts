import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(120 * 1000)

/**
 * Границы авторизации на реальном HTTP (audit p.52, design D1).
 *
 * Фикстур нет: проверяются только ответы на запросы без сессии.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api }) => {
    describe("authentication boundaries over HTTP", () => {
      const anyStatus = { validateStatus: () => true }

      it("admin product list is rejected without a session", async () => {
        const res = await api.get("/admin/products", anyStatus)

        expect([401, 403]).toContain(res.status)
        expect(res.data).toHaveProperty("message")
      })

      it("admin order list is rejected without a session", async () => {
        const res = await api.get("/admin/orders", anyStatus)

        expect([401, 403]).toContain(res.status)
        expect(res.data).toHaveProperty("message")
      })
    })
  },
})
