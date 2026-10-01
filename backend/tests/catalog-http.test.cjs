const { test } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { catalogMiddlewares } = require('../src/utils/catalog-http')
const { GET } = require('../src/api/store/catalog/products/route')
const { ContainerRegistrationKeys, Modules } = require('@medusajs/framework/utils')

function fixture(parameters = {}, config = {}) {
  const calls = []
  const products = Array.from({ length: 205 }, (_, i) => ({ id: `p${String(i).padStart(3, '0')}`, title: `Product shirt ${i}`,
    created_at: '2026-01-01', type_id: null, options: [{ id: 'size', title: 'Size' }, { id: 'color', title: 'Color' }],
    variants: [{ id: `v${i}`, product_id: `p${i}`, manage_inventory: false,
      options: [{ option_id: 'size', value: 'L' }, { option_id: 'color', value: 'Black' }],
      calculated_price: { currency_code: 'rsd', calculated_amount: 205 - i, original_amount: 205 - i, is_calculated_price_tax_inclusive: false } }],
  }))
  if (config.prepare) config.prepare(products)
  const graph = async (args, options) => {
    calls.push({ ...args, options })
    if (args.entity === 'product_sales_channel') return { data: config.emptyChannel ? [] : products.map(p => ({ product_id: p.id })) }
    if (args.entity === 'region') return { data: args.filters.id === 'reg_rs' ? [{ id: 'reg_rs', currency_code: 'rsd', automatic_taxes: true }] : [] }
    if (args.entity === 'customer_group') return { data: [{ id: 'vip' }] }
    if (['product_variant_inventory_items', 'sales_channel_locations'].includes(args.entity)) return { data: [] }
    assert.equal(args.entity, 'product')
    assert.equal(args.filters.status, 'published')
    assert.deepEqual(args.context.variants.calculated_price.currency_code, 'rsd')
    const allowed = products.filter(p => args.filters.id.includes(p.id) && p.id !== config.excludedId)
    return { data: structuredClone(allowed.slice(args.pagination.skip, args.pagination.skip + args.pagination.take)),
      metadata: { count: config.oversized ? 10001 : allowed.length } }
  }
  const req = { query: { region_id: 'reg_rs', ...parameters }, headers: {},
    publishable_key_context: { sales_channel_ids: config.noChannels ? [] : ['sc_store'] },
    locale: config.locale || 'sr-RS',
    scope: { resolve(key) {
      if (key === Modules.TRANSLATION) return { listTranslations: async (filters, options) => {
        calls.push({ entity: 'translation', filters, options })
        assert.equal(filters.reference, 'product')
        return (config.translations || []).filter(t => filters.reference_id.includes(t.reference_id)).slice(options.skip, options.skip + options.take)
      } }
      if (key === ContainerRegistrationKeys.QUERY) return { graph }
      if (key === ContainerRegistrationKeys.CONFIG_MODULE) return { projectConfig: { http: { jwtSecret: 'test-only' } } }
      if (key === Modules.TAX) return { getTaxLines: async items => items.map(item => ({ line_item_id: item.id, rate: 20 })) }
      throw Error(`Unexpected dependency ${key}`)
    } },
  }
  if (config.customer) req.session = { auth_context: { actor_type: 'customer', actor_id: 'cus_test' } }
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
  return { req, res, calls }
}
async function run(f) {
  for (const middleware of catalogMiddlewares) {
    let nextCalled = false
    await middleware(f.req, f.res, error => { if (error) throw error; nextCalled = true })
    if (!nextCalled) return
  }
  await GET(f.req, f.res)
}
test('real Medusa middleware and route: channel scoping, full scan, global price sort, exact count and private response', async () => {
  const f = fixture({ sort: 'price_asc', limit: '2', offset: '1', color: 'Black', size: 'L' })
  await run(f)
  assert.equal(f.res.body.count, 205)
  assert.deepEqual(f.res.body.products.map(p => p.id), ['p203', 'p202'])
  assert.equal(f.res.body.products[0].catalog.price, 2)
  assert.equal(f.res.body.filters.colors[0].count, 205)
  assert.equal(f.res.headers['Cache-Control'], 'private, no-store')
  assert.deepEqual(f.calls.find(c => c.entity === 'product_sales_channel').filters, { sales_channel_id: ['sc_store'] })
  assert.equal(f.calls.filter(c => c.entity === 'product').length, 3)
  for (const c of f.calls.filter(c => c.entity === 'product')) assert.equal(c.options.cache.enable, false)
})
test('native pricing receives authenticated customer group; country taxes applied before filtering', async () => {
  const f = fixture({ country_code: 'rs', min_price: '1,2', max_price: '1,2', category_id: 'pcat_shirts', q: 'shirt' }, { customer: true })
  await run(f)
  assert.equal(f.res.body.count, 1)
  assert.equal(f.res.body.products[0].catalog.price, 1.2)
  const call = f.calls.find(c => c.entity === 'product')
  assert.deepEqual(call.context.variants.calculated_price.customer, { groups: [{ id: 'vip' }] })
  assert.deepEqual(call.filters.categories, { id: 'pcat_shirts', is_internal: false, is_active: true })
  assert.equal(call.filters.q, undefined)
  assert.equal(f.req.catalogInput.q, 'shirt')
  assert.equal(call.filters.region_id, undefined)
})
test('scope failures and invalid parameters fail closed; empty channel exposes no products', async () => {
  const empty = fixture({}, { emptyChannel: true }); await run(empty)
  assert.equal(empty.res.body.count, 0)
  assert.deepEqual(empty.res.body.filters.colors, [])
  await assert.rejects(run(fixture({}, { noChannels: true })), /sales channel/)
  await assert.rejects(run(fixture({ region_id: 'foreign' })), /not found/)
  const invalid = fixture({ status: 'draft' }); await run(invalid)
  assert.equal(invalid.res.statusCode, 400)
  assert.equal(invalid.calls.length, 0)
  const oversized = fixture({}, { oversized: true }); await run(oversized)
  assert.equal(oversized.res.statusCode, 503)
  assert.equal(oversized.res.body.code, 'CATALOG_SCOPE_TOO_LARGE')
})


test('search finds base, metadata and native Serbian/English translations before pagination and facets', async () => {
  const config = {
    prepare(products) {
      products[200].title = 'Silk tie'
      products[200].metadata = { i18n: { sr: { title: 'Svilena kravata' }, en: { title: 'Silk tie' } } }
      products[203].title = 'Evening tie'
      products[204].title = 'Private tie'
    },
    excludedId: 'p204',
    translations: [
      { reference_id: 'p203', locale_code: 'sr-RS', translations: { title: 'Večernja kravata' } },
      { reference_id: 'p203', locale_code: 'en', translations: { title: 'Evening tie' } },
      { reference_id: 'p204', locale_code: 'sr-RS', translations: { title: 'Tajna kravata' } },
    ],
  }
  for (const locale of ['sr-RS', 'en']) {
    const f = fixture({ q: 'KRAVATA', sort: 'price_asc', limit: '1', offset: '1' }, { ...config, locale }); await run(f)
    assert.equal(f.res.body.count, 2)
    assert.deepEqual(f.res.body.products.map(p => p.id), ['p200'])
    assert.equal(f.res.body.filters.colors[0].count, 2)
    const productCalls = f.calls.filter(c => c.entity === 'product')
    assert.equal(productCalls.at(-1).options.locale, locale)
    assert.equal(productCalls[0].options.locale, undefined)
    assert.ok(productCalls.every(c => c.filters.q === undefined))
    for (const q of ['Silk tie', 'svilena', 'vecernja', 'Evening tie']) {
      const one = fixture({ q }, { ...config, locale }); await run(one); assert.equal(one.res.body.count, 1, `${locale}: ${q}`)
    }
  }
  const filtered = fixture({ q: 'kravata', max_price: '2', size: 'L', color: 'Black' }, config); await run(filtered)
  assert.deepEqual(filtered.res.body.products.map(p => p.id), ['p203'])
  const empty = fixture({ q: 'no-such-name' }, config); await run(empty); assert.equal(empty.res.body.count, 0)
})
