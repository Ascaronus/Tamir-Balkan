import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { wishlistSchema } from "../../src/utils/wishlist"
import jwt from "jsonwebtoken"

jest.setTimeout(120 * 1000)
// Real HTTP, middleware, customer module and PostgreSQL. No production services.
medusaIntegrationTestRunner({ inApp: true, testSuite: ({ api, getContainer }) => {
  it("wishlist HTTP enforces auth, idempotency, account isolation and removable stale products", async () => {
    const container = getContainer(), db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
    await db.raw(wishlistSchema)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: keys } = await query.graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
    const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
    const customerModule = container.resolve(Modules.CUSTOMER)
    const a = await customerModule.createCustomers({ email: "wishlist-a@example.test", has_account: true })
    const b = await customerModule.createCustomers({ email: "wishlist-b@example.test", has_account: true })
    // Module fixtures avoid workflow events; this test has no background subscribers.
    const product = await container.resolve(Modules.PRODUCT).createProducts({ title: "Wishlist test", handle: "wishlist-test", status: "published" })
    await container.resolve(ContainerRegistrationKeys.LINK).create({ [Modules.PRODUCT]: { product_id: product.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: channels[0].id } })
    const secret = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig.http.jwtSecret!
    const config = (id?: string) => ({ validateStatus: () => true, headers: {
      "x-publishable-api-key": keys[0].token,
      ...(id ? { authorization: `Bearer ${jwt.sign({ actor_id: id, actor_type: "customer", auth_identity_id: `auth_${id}`, app_metadata: { customer_id: id } }, secret, { expiresIn: "5m" })}` } : {}),
    } })
    for (const method of ["get", "post", "delete"] as const) {
      const response = method === "get" ? await api.get("/store/wishlist", config()) : method === "post" ? await api.post("/store/wishlist", { product_id: product.id }, config()) : await api.delete(`/store/wishlist/${product.id}`, config())
      expect(response.status).toBe(401)
    }
    expect((await api.post("/store/wishlist", { product_id: product.id, customer_id: b.id }, config(a.id))).status).toBe(400)
    const saves = await Promise.all(Array.from({ length: 5 }, () => api.post("/store/wishlist", { product_id: product.id }, config(a.id))))
    expect(saves.map(r => r.status)).toEqual([200, 200, 200, 200, 200])
    expect((await api.get("/store/wishlist", config(a.id))).data.product_ids).toEqual([product.id])
    expect((await api.get("/store/wishlist", config(b.id))).data.product_ids).toEqual([])
    await api.delete(`/store/wishlist/${product.id}`, config(b.id))
    expect((await api.get("/store/wishlist", config(a.id))).data.product_ids).toEqual([product.id])
    await container.resolve(Modules.PRODUCT).updateProducts(product.id, { status: "draft" })
    expect((await api.post("/store/wishlist", { product_id: product.id }, config(a.id))).status).toBe(404)
    expect((await api.delete(`/store/wishlist/${product.id}`, config(a.id))).data.saved).toBe(false)
    expect((await api.delete(`/store/wishlist/${product.id}`, config(a.id))).status).toBe(200)
    expect((await api.get("/store/wishlist", config(a.id))).data.product_ids).toEqual([])
  })
} })
