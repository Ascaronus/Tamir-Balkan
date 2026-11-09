import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import nodemailer from "nodemailer"
import jwt from "jsonwebtoken"
import subscriber from "../../src/subscribers/order-confirmation"

jest.setTimeout(120000)
medusaIntegrationTestRunner({ inApp: true, testSuite: ({ api, getContainer }) => {
  it("receipt projection matches native order HTTP quantities and calculated totals for multiple lines", async () => {
    const container = getContainer()
    const user = await container.resolve(Modules.USER).createUsers({ email: "receipt-admin@example.test" })
    const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.jwtSecret!
    const headers = { authorization: `Bearer ${jwt.sign({ actor_id: user.id, actor_type: "user", auth_identity_id: `auth_${user.id}`, app_metadata: { user_id: user.id } }, secret, { expiresIn: "5m" })}` }
    const sent: { text: string; html: string }[] = []
    const savedEnv = { user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD }
    process.env.SMTP_USER = "sender@example.test"; process.env.SMTP_PASSWORD = "test-only"
    // Only the SMTP boundary is replaced; order storage, graph and HTTP are real Medusa.
    const transport = jest.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail: async (mail: { text: string; html: string }) => { sent.push(mail); return { accepted: ["receipt@example.test"] } }, close() {} } as never)
    try {
      for (const discounted of [false, true]) {
        const order = await container.resolve(Modules.ORDER).createOrders({
          currency_code: "rsd", email: "receipt@example.test",
          items: [
            { title: "Plava kapa", variant_title: "One Size / Blue", quantity: 2, unit_price: 1440, is_tax_inclusive: true,
              ...(discounted ? { tax_lines: [{ description: "VAT", code: "VAT", rate: 20 }], adjustments: [{ code: "TEST", amount: 240 }] } : {}) },
            { title: "Siva kapa", variant_title: "One Size / Gray", quantity: 3, unit_price: 1440 },
          ],
          shipping_methods: [{ name: "Delivery", amount: 300 }],
        })
        const response = await api.get(`/admin/orders/${order.id}`, { headers })
        expect(response.status).toBe(200)
        const native = response.data.order
        expect(native.items.map((item: { quantity: number }) => item.quantity).sort()).toEqual([2, 3])
        expect(native.total).toBeGreaterThan(0)
        if (!discounted) expect(native.total).toBe(7500)
        const run = () => subscriber({ event: { name: "order.placed", data: { id: order.id } }, container } as Parameters<typeof subscriber>[0])
        const before = sent.length
        await run(); await run()
        expect(sent.length).toBe(before + 1)
        const mail = sent.at(-1)!
        const money = (value: number) => new Intl.NumberFormat("sr-Latn-RS", { style: "currency", currency: "RSD" }).format(value)
        for (const part of [mail.text, mail.html]) {
          expect(part).not.toMatch(/undefined|NaN/)
          expect(part).toContain("Lines: 2"); expect(part).toContain("Units: 5")
          expect(part).toContain(money(native.total)); expect(part).toContain(money(native.shipping_total))
          for (const item of native.items) expect(part).toContain(money(item.total))
        }
        expect(mail.text).toContain("Quantity: 2 ×"); expect(mail.text).toContain("Quantity: 3 ×")
      }
    } finally {
      transport.mockRestore()
      if (savedEnv.user === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = savedEnv.user
      if (savedEnv.password === undefined) delete process.env.SMTP_PASSWORD; else process.env.SMTP_PASSWORD = savedEnv.password
    }
  })
} })
