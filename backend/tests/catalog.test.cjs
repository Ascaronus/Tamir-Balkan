const { test } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { parseCatalogInput, selectCatalog, variantPrice } = require('../src/utils/catalog')
const input = overrides => parseCatalogInput({ region_id: 'reg_rs', ...overrides })
const variant = (id, size, color, amount) => ({ id, options: [{ option_id: 's', value: size }, { option_id: 'c', value: color }],
  calculated_price: amount === null ? null : { calculated_amount: amount, currency_code: 'rsd' } })
const product = (id, variants, date = '2026-01-01') => ({ id, created_at: date, options: [{ id: 's', title: 'Veličina' }, { id: 'c', title: 'Boja' }], variants })
const select = (products, overrides = {}, popularity) => selectCatalog(products, input(overrides), 'rsd', popularity)

test('query validation: decimals, repeated values, bounds and forbidden Store overrides', () => {
  assert.deepEqual(input({ size: [' L ', 'l', '42,5'], color: 'BLACK', min_price: '0', max_price: '12,50' }), {
    region_id: 'reg_rs', country_code: undefined, province: undefined, category_id: undefined, q: undefined,
    size: ['l', '42,5'], color: ['black'], min_price: 0, max_price: 12.5, sort: 'newest', limit: 24, offset: 0,
  })
  for (const query of [{ min_price: '-1' }, { min_price: '1e3' }, { min_price: '1,2.3' }, { min_price: ' ' },
    { min_price: '2', max_price: '1' }, { max_price: 'Infinity' }, { size: { $ne: 'M' } }, { size: Array(21).fill('M') },
    { region_id: '' }, { limit: '101' }, { limit: '0' }, { offset: '-1' }, { sort: 'random' }, { country_code: '123' },
    { province: 'x' }, { fields: '*' }, { status: 'draft' }, { sales_channel_id: 'foreign' }, { with_deleted: 'true' },
    { customer_id: 'foreign' }, { cart_id: 'foreign' }, { order: 'price' }]) assert.throws(() => input(query), undefined, JSON.stringify(query))
})
test('size, color and price must match the same variant; lists use OR and count products once', () => {
  const products = [product('a', [variant('red-m', 'M', 'Red', 10), variant('blue-l', 'L', 'Blue', 20)])]
  assert.equal(select(products, { size: 'L', color: 'red' }).count, 0)
  assert.equal(select(products, { size: 'L', max_price: '15' }).count, 0)
  const result = select(products, { size: ['m', 'l'], color: ['red', 'blue'], min_price: '10', max_price: '20' })
  assert.equal(result.count, 1)
  assert.equal(result.rows[0].price, 10)
  assert.deepEqual(result.rows[0].matching_variant_ids, ['red-m', 'blue-l'])
  assert.equal(result.rows[0].preferred_variant_id, 'red-m')
})
test('facets ignore their own selection, count distinct products and price bounds ignore price selection', () => {
  const products = [product('a', [variant('a1', 'M', 'Red', 10), variant('a2', 'L', 'Red', 20), variant('a3', 'M', 'Red', 10)]),
    product('b', [variant('b1', 'L', 'Blue', 30)])]
  const result = select(products, { color: 'red', size: 'L', max_price: '25' })
  assert.deepEqual(result.filters.sizes, [{ value: 'l', label: 'L', count: 1 }, { value: 'm', label: 'M', count: 1 }])
  assert.deepEqual(result.filters.colors, [{ value: 'red', label: 'Red', count: 1 }])
  assert.deepEqual(result.filters.price, { min: 20, max: 20, currency_code: 'rsd' })
  assert.deepEqual(select(products, { min_price: '999' }).filters.price, { min: 10, max: 30, currency_code: 'rsd' })
})
test('calculated discount/tax prices, inclusive fractional bounds, free and unpriced variants', () => {
  const v = variant('a', 'M', 'Red', 12.5)
  v.calculated_price.original_amount = 100
  v.calculated_price.calculated_amount_with_tax = 15
  assert.equal(variantPrice(v, 'rsd'), 15)
  assert.equal(variantPrice(v, 'eur'), null)
  assert.equal(select([product('a', [v])], { min_price: '15', max_price: '15,00' }).count, 1)
  const items = [product('missing', [variant('m', 'M', 'Red', null)]), product('free', [variant('f', 'M', 'Red', 0)]), product('paid', [v])]
  assert.deepEqual(select(items, { sort: 'price_asc' }).rows.map(p => p.id), ['free', 'paid', 'missing'])
  assert.deepEqual(select(items, { sort: 'price_desc' }).rows.map(p => p.id), ['paid', 'free', 'missing'])
  assert.deepEqual(select(items, { max_price: '0' }).rows.map(p => p.id), ['free'])
})
test('sort before pagination, stable ties, newest and completed-sales popularity', () => {
  const products = Array.from({ length: 250 }, (_, i) => product(String(i).padStart(3, '0'), [variant(`v${i}`, 'M', 'Red', 250 - i)]))
  const result = select(products, { sort: 'price_asc', offset: '24', limit: '2' })
  assert.equal(result.count, 250)
  assert.deepEqual(result.rows.map(p => p.id), ['225', '224'])
  const dates = [product('b', [variant('b', 'M', 'Red', 10)]), product('a', [variant('a', 'M', 'Red', 10)]),
    product('new', [variant('n', 'M', 'Red', 10)], '2026-02-01')]
  assert.deepEqual(select(dates).rows.map(p => p.id), ['new', 'a', 'b'])
  assert.deepEqual(select(dates, { sort: 'popularity' }, new Map([['b', 4]])).rows.map(p => p.id), ['b', 'new', 'a'])
  assert.equal(select(dates, { offset: '99' }).count, 3)
  assert.deepEqual(select([], {}).filters.price, { min: null, max: null, currency_code: 'rsd' })
})
test('multilingual option names and products without a size/color', () => {
  for (const [size, color] of [['Size', 'Colour'], ['Размер', 'Цвет'], ['Розмір', 'Колір'], ['Veličina', 'Boja']]) {
    const p = product('a', [variant('a', '42,5', 'Crna', 10)])
    p.options[0].title = size; p.options[1].title = color
    assert.equal(select([p], { size: '42,5', color: 'CRNA' }).count, 1)
  }
  const p = product('a', [{ id: 'a', calculated_price: { calculated_amount: 10, currency_code: 'rsd' } }])
  assert.equal(select([p]).count, 1)
  assert.equal(select([p], { color: 'red' }).count, 0)
})
