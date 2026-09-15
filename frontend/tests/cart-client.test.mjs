import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"

function fixture() {
  let cartId = "cart_1"
  let reads = 0
  const before = { id: "cart_1", region_id: "region_rs", items: [] }
  const after = { ...before, items: [{ id: "line_1", quantity: 2 }] }
  const calls = []
  const cart = {
    createLineItem: async (...args) => { calls.push(["add", ...args]); return { cart: after } },
    updateLineItem: async (...args) => { calls.push(["update", ...args]); return { cart: after } },
    deleteLineItem: async (...args) => { calls.push(["delete", ...args]); return { parent: after } },
    create: async () => { calls.push(["create"]); return { cart: before } },
  }
  const modules = {
    "@/lib/medusa": { sdk: { store: { cart }, client: {
      fetch: async () => {
        if (++reads > 1) throw Error("network unavailable after mutation")
        return { cart: before }
      },
    } } },
    "@/lib/store/regions": { getRegionByCountry: async () => ({ id: "region_rs" }) },
    "@/lib/store/commerce": { requireQuantity: n => {
      if (!Number.isSafeInteger(n) || n < 1) throw Error("Invalid quantity")
    } },
    "./cart-storage": {
      getStoredCartId: () => cartId,
      setStoredCartId: value => { cartId = value },
      clearStoredCartId: () => { cartId = null },
    },
  }
  const source = readFileSync(new URL("../src/lib/cart/cart-client.ts", import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const exports = {}
  runInNewContext(outputText, { exports, require: name => {
    if (!(name in modules)) throw Error("Unexpected dependency: " + name)
    return modules[name]
  } })
  return { api: exports, cart, after, calls, clear: () => { cartId = null } }
}
for (const [method, args, action] of [
  ["addToCart", { variantId: "variant_1", quantity: 2 }, "add"],
  ["updateLineItem", { lineItemId: "line_1", quantity: 2 }, "update"],
  ["removeLineItem", { lineItemId: "line_1" }, "delete"],
]) {
  test(method + " returns successful mutation without a fragile follow-up GET", async () => {
    const f = fixture()
    assert.equal(await f.api[method]({ countryCode: "rs", ...args }), f.after)
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0][0], action)
  })
}
test("concurrent cart initialization creates one cart", async () => {
  const f = fixture()
  f.clear()
  const [a, b] = await Promise.all([f.api.getOrCreateCart("rs"), f.api.getOrCreateCart("rs")])
  assert.equal(a, b)
  assert.equal(f.calls.filter(call => call[0] === "create").length, 1)
})
test("failed stock mutation is not retried as a second addition", async () => {
  const f = fixture()
  let calls = 0
  f.cart.createLineItem = async () => { calls++; throw Error("Insufficient inventory") }
  await assert.rejects(f.api.addToCart({ countryCode: "rs", variantId: "variant_1" }), /Insufficient inventory/)
  assert.equal(calls, 1)
})
