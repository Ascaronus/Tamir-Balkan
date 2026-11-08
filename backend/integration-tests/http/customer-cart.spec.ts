import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows"
import { customerCartSchema } from "../../src/utils/customer-cart"
import jwt from "jsonwebtoken"

jest.setTimeout(120000)
medusaIntegrationTestRunner({ inApp: true, testSuite: ({ api, getContainer }) => {
  it("restores account carts, retains stale lines, isolates owners and preserves guest checkout", async () => {
    const container = getContainer(), db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    await db.raw(customerCartSchema)
    await db.raw(customerCartSchema) // Deployment setup is repeatable.
    const { result: [region] } = await createRegionsWorkflow(container).run({ input: { regions: [{ name: "Cart persistence", currency_code: "eur", countries: ["rs"] }] } })
    const { data: keys } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
    const customers = container.resolve(Modules.CUSTOMER), carts = container.resolve(Modules.CART)
    const a = await customers.createCustomers({ email: "cart-a@example.test", has_account: true })
    const b = await customers.createCustomers({ email: "cart-b@example.test", has_account: true })
    const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.jwtSecret!
    const config = (id?: string) => ({ validateStatus: () => true, headers: {
      "x-publishable-api-key": keys[0].token,
      ...(id ? { authorization: `Bearer ${jwt.sign({ actor_id: id, actor_type: "customer", auth_identity_id: `auth_${id}`, app_metadata: { customer_id: id } }, secret, { expiresIn: "5m" })}` } : {}),
    } })
    const body = { region_id: region.id, country_code: "rs" }
    expect((await api.post("/store/customer-cart", body, config())).status).toBe(401)
    expect((await api.post("/store/customer-cart", { ...body, customer_id: b.id }, config(a.id))).status).toBe(400)
    const responses = await Promise.all(Array.from({ length: 3 }, () => api.post("/store/customer-cart", body, config(a.id))))
    expect(responses.map(r => r.status)).toEqual([200, 200, 200])
    const id = responses[0].data.cart_id
    expect(responses.every(r => r.data.cart_id === id)).toBe(true)
    // A retained line whose variant no longer exists must not be dropped during restore.
    await carts.addLineItems(id, [{ title: "Unavailable retained item", quantity: 4, unit_price: 100, requires_shipping: false }])
    expect((await api.post("/store/customer-cart", body, config(a.id))).data.cart_id).toBe(id)
    expect((await api.get(`/store/carts/${id}`, config(a.id))).data.cart.items[0].quantity).toBe(4)
    for (const encoded of [id, id.replace("cart_", "%63art_")]) {
      expect((await api.get(`/store/carts/${encoded}`, config())).status).toBe(401)
      expect((await api.get(`/store/carts/${encoded}`, config(b.id))).status).toBe(404)
    }
    expect((await api.post(`/store/carts/${id}/customer`, {}, config(b.id))).status).toBe(404)
    expect((await api.post(`/store/carts/${id}/complete`, {}, config())).status).toBe(401)
    const guest = await api.post("/store/carts", { region_id: region.id }, config())
    expect(guest.status).toBe(200)
    const guestId = guest.data.cart.id
    const claimed = await api.post("/store/customer-cart", { ...body, guest_cart_id: guestId }, config(b.id))
    expect(claimed.status).toBe(200)
    expect(claimed.data).toEqual({ cart_id: guestId, claimed_guest: true })
    expect((await api.get(`/store/carts/${guestId}`, config())).status).toBe(401)
    // Email matching an account is NOT proof of ownership or a reason to block guest checkout.
    const emailGuest = await api.post("/store/carts", { region_id: region.id, email: a.email }, config())
    expect(emailGuest.status).toBe(200)
    expect((await api.get(`/store/carts/${emailGuest.data.cart.id}`, config())).status).toBe(200)
    expect((await api.post(`/store/carts/${emailGuest.data.cart.id}`, { metadata: { notes: "guest checkout" } }, config())).status).toBe(200)
    expect((await api.post("/store/customer-cart", body, config(a.id))).data.cart_id).toBe(id)
    await carts.updateCarts(id, { completed_at: new Date() })
    const replacement = await api.post("/store/customer-cart", body, config(a.id))
    expect(replacement.status).toBe(200)
    expect(replacement.data.cart_id).not.toBe(id)
    expect(replacement.data.cart_id).not.toBe(emailGuest.data.cart.id)
  })
} })
