import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"

function fixture({ inventory, variants, items = [], lookupFails = false } = {}) {
  let cartId = "cart_1"
  let reads = 0
  const before = { id: "cart_1", region_id: "region_rs", sales_channel_id: "sc_store", items }
  const after = { ...before, items: [{ id: "line_1", quantity: 2 }] }
  const calls = []
  const events = []
  const lookups = []
  const cart = {
    createLineItem: async (...args) => { calls.push(["add", ...args]); return { cart: after } },
    updateLineItem: async (...args) => { calls.push(["update", ...args]); return { cart: after } },
    deleteLineItem: async (...args) => { calls.push(["delete", ...args]); return { parent: after } },
    create: async () => { calls.push(["create"]); return { cart: before } },
  }
  const modules = {
    "@/lib/medusa": { sdk: { store: { cart }, client: {
      fetch: async (url, options) => {
        if (url === '/store/products') {
          lookups.push(options)
          if (lookupFails || (inventory === undefined && !variants)) throw Error('inventory lookup unavailable')
          return { products: [{ variants: variants ?? [{ id: 'variant_1', manage_inventory: true, allow_backorder: false, inventory_quantity: inventory }] }] }
        }
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
  runInNewContext(outputText, { exports, Event, window: { dispatchEvent: event => events.push(event.type) }, require: name => {
    if (!(name in modules)) throw Error("Unexpected dependency: " + name)
    return modules[name]
  } })
  return { api: exports, cart, after, calls, events, lookups, stored:()=>cartId, clear: () => { cartId = null } }
}

test('completed checkout clears storage and notifies the persistent cart provider',async()=>{
 const f=fixture();await f.api.clearCartId()
 assert.equal(f.stored(),null);assert.deepEqual(f.events,['tb-cart-reset']);assert.equal(f.calls.length,0)
})
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

for (const method of ['addToCart', 'updateLineItem']) test(`${method}: rejected stock request reports reservation-adjusted availability, including existing cart items`, async () => {
  // Medusa's inventory_quantity is available stock (10 stocked minus 7 reserved), not physical stock.
  const f = fixture({ inventory: 3, items: [{ id: 'line_1', variant_id: 'variant_1', quantity: 2 }] })
  const error = Object.assign(Error('Some variant does not have the required inventory'), { status: 400 })
  let attempts = 0
  f.cart[method === 'addToCart' ? 'createLineItem' : 'updateLineItem'] = async () => { attempts++; throw error }
  await assert.rejects(f.api[method]({ countryCode: 'rs', variantId: 'variant_1', lineItemId: 'line_1', quantity: 4 }), e =>
    e.name === 'CartStockError' && e.available === 3 && e.inCart === 2 && e.variantId === 'variant_1')
  assert.equal(attempts, 1)
  assert.equal(f.lookups.length, 1)
  assert.equal(f.lookups[0].cache, 'no-store')
  assert.equal(f.lookups[0].query.sales_channel_id[0], 'sc_store')
  assert.equal(f.lookups[0].query.variants.id[0], 'variant_1')
})

test('stock errors preserve zero availability and never invent counts when lookup fails', async () => {
  for (const options of [{inventory:0}, {inventory:NaN}, {inventory:3,lookupFails:true}]) {
    const f=fixture(options),error=Object.assign(Error('Some variant does not have the required inventory'),{status:400})
    f.cart.createLineItem=async()=>{throw error}
    await assert.rejects(f.api.addToCart({countryCode:'rs',variantId:'variant_1'}),e=>options.inventory===0 ? e.available===0 : e===error)
  }
})

test('unrelated failed mutations do not fetch or reveal inventory',async()=>{
  const f=fixture({inventory:25}),error=Object.assign(Error('Network error'),{status:503})
  f.cart.createLineItem=async()=>{throw error}
  await assert.rejects(f.api.addToCart({countryCode:'rs',variantId:'variant_1'}),e=>e===error)
  assert.equal(f.lookups.length,0)
})

test('a rejection concerning another cart item must not misreport stock for the requested variant',async()=>{
  const f=fixture({inventory:10}),error=Object.assign(Error('Some variant does not have the required inventory'),{status:400})
  f.cart.createLineItem=async()=>{throw error}
  await assert.rejects(f.api.addToCart({countryCode:'rs',variantId:'variant_1',quantity:2}),e=>e===error)
})

for (const [method, quantity, expectedStockError] of [
  ['addToCart', 1, true],
  ['updateLineItem', 2, false],
  ['updateLineItem', 3, true],
]) test(`${method} quantity ${quantity}: counts other lines of the same variant and replaces the edited line`, async () => {
  const f = fixture({ inventory: 5, items: [
    { id: 'line_1', variant_id: 'variant_1', quantity: 2 },
    { id: 'line_2', variant_id: 'variant_1', quantity: 3 },
    { id: 'other', variant_id: 'variant_2', quantity: 20 },
  ] })
  const error = Object.assign(Error('Some variant does not have the required inventory'), { status: 400 })
  f.cart[method === 'addToCart' ? 'createLineItem' : 'updateLineItem'] = async () => { throw error }
  await assert.rejects(f.api[method]({ countryCode: 'rs', variantId: 'variant_1', lineItemId: 'line_1', quantity }), e =>
    expectedStockError ? e.available === 5 && e.inCart === 5 : e === error)
})

test('availability lookup distinguishes reserved-out stock, unlimited variants and unavailable data',async()=>{
 const f=fixture({variants:[
  {id:'zero',manage_inventory:true,inventory_quantity:0},
  {id:'reserved',manage_inventory:true,inventory_quantity:1},
  {id:'unmanaged',manage_inventory:false},
  {id:'backorder',manage_inventory:true,allow_backorder:true,inventory_quantity:0},
  {id:'missing',manage_inventory:true},
  {id:'unrequested',manage_inventory:true,inventory_quantity:999},
 ]})
 const limits=await f.api.getVariantStock(['zero','reserved','unmanaged','backorder','missing'],'sc_store')
 assert.deepEqual(JSON.parse(JSON.stringify(limits)),{zero:0,reserved:1,unmanaged:null,backorder:null})
 assert.equal(f.lookups[0].cache,'no-store');assert.equal(f.lookups[0].query.sales_channel_id[0],'sc_store')
})
test('availability batches large carts, deduplicates variants and forwards cancellation',async()=>{
 const variants=Array.from({length:205},(_,i)=>({id:`v${i}`,manage_inventory:true,inventory_quantity:1})),f=fixture({variants}),signal={}
 const limits=await f.api.getVariantStock([...variants.map(v=>v.id),'v0'],'sc_store',signal)
 assert.equal(Object.keys(limits).length,205)
 assert.deepEqual(f.lookups.map(r=>r.query.limit),[100,100,5])
 assert.ok(f.lookups.every(r=>r.signal===signal))
})
