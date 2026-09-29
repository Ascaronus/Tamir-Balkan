import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from '../test-support/component-harness.mjs'
const { productJsonLd, productBrand, validGtin } = load('frontend/src/lib/seo/product.ts', {
  '@/lib/i18n/content': { localizedText: (_p, _key, fallback) => fallback },
  '@/lib/product-image': { getImagesForVariant: p => p.images || [] },
  '@/lib/store/commerce': load('frontend/src/lib/store/commerce.ts'),
})
const url = 'https://tamir.rs/rs/products/test'
const product = (price = { calculated_amount: 1500, currency_code: 'rsd' }) => ({
  id: 'p1', title: 'Suit', description: '<p>Wool suit</p>', metadata: {}, images: [{ url: 'https://tamir.rs/suit.jpg' }],
  variants: [{ id: 'v1', sku: 'T-0001', manage_inventory: true, inventory_quantity: 2, calculated_price: price }],
})
const reviews = () => ({ count: 2, rating: 4.5, has_review: false, reviews: [
  { name: 'Igor', body: 'Good fit', rating: 5, created_at: '2026-09-22T23:30:00Z', email: 'private@example.test', customer_id: 'private-id' },
  { name: 'Marko', body: 'Good material', rating: 4, created_at: '2026-09-23T10:00:00Z' },
] })

test('unpriced products without reviews do not emit incomplete Product markup', () => {
  for (const price of [null, {}, { calculated_amount: NaN, currency_code: 'rsd' }, { calculated_amount: -1, currency_code: 'rsd' }, { calculated_amount: 1500 }]) {
    assert.equal(productJsonLd(product(price), 'en', url, null), null)
  }
})
test('real offers use catalog amount and availability without invented ratings or policies', () => {
  const data = productJsonLd(product(), 'en', url, null)
  assert.equal(data.offers[0].price, 1500)
  assert.equal(data.offers[0].priceCurrency, 'RSD')
  assert.equal(data.offers[0].availability, 'https://schema.org/InStock')
  assert.equal(data.offers[0].url, url + '?v_id=v1')
  assert.equal(data.description, 'Wool suit')
  for (const field of ['review', 'aggregateRating', 'gtin13']) assert.equal(field in data, false)
  assert.equal('hasMerchantReturnPolicy' in data.offers[0], false)
  assert.equal(data.brand.name, 'TAMIR')
})
test('published reviews and aggregate are projected without private account fields', () => {
  const data = productJsonLd(product(null), 'en', url, reviews())
  assert.equal(data.aggregateRating.ratingValue, 4.5)
  assert.equal(data.aggregateRating.reviewCount, 2)
  assert.equal(data.review[0].author.name, 'Igor')
  assert.equal(data.review[0].reviewBody, 'Good fit')
  assert.equal(data.review[0].reviewRating.ratingValue, 5)
  assert.equal('offers' in data, false)
  assert.equal(JSON.stringify(data).includes('private'), false)
})
test('invalid ratings, dates and email-like author names are excluded', () => {
  const list = { count: 0, rating: NaN, reviews: [
    { ...reviews().reviews[0], name: 'private@example.test' },
    { ...reviews().reviews[0], rating: 0 },
    { ...reviews().reviews[0], created_at: 'invalid' },
  ] }
  const data = productJsonLd(product(), 'en', url, list)
  assert.equal('review' in data, false)
  assert.equal('aggregateRating' in data, false)
})
test('confirmed TAMIR brand fills missing data while explicit brands remain supported', () => {
  assert.equal(productBrand({}), 'TAMIR')
  assert.equal(productBrand({ brand: '  Actual brand ', rozetka_vendor: 'Vendor' }), 'Actual brand')
  assert.equal(productBrand({ rozetka_vendor: 'Vendor' }), 'Vendor')
  const p = product(); p.metadata.brand = 'Actual brand'
  assert.equal(productJsonLd(p, 'en', url, null).brand.name, 'Actual brand')
})
test('GTIN preserves zeroes and validates checksum without reusing internal SKUs', () => {
  for (const code of ['96385074', '012345678905', '4006381333931', '10012345000017']) assert.equal(validGtin(code), code)
  for (const code of ['4006381333932', '00000000', 'T-0001', 4006381333931]) assert.equal(validGtin(code), undefined)
  const p = product(); p.variants[0].ean = '4006381333931'
  assert.equal(productJsonLd(p, 'en', url, null).gtin13, '4006381333931')
  p.variants.push({ ...p.variants[0], id: 'v2', ean: '5901234123457' })
  assert.equal(productJsonLd(p, 'en', url, null).gtin13, undefined)
})
test('schema matches tax-inclusive prices and preserves legitimate zero prices', () => {
  for (const amount of [0, 1800.5]) {
    const data = productJsonLd(product({ calculated_amount: 1500, calculated_amount_with_tax: amount, currency_code: 'rsd' }), 'en', url, null)
    assert.equal(JSON.parse(JSON.stringify(data)).offers[0].price, amount)
  }
})

test('confirmed Serbia shipping is emitted only for RSD offers', () => {
  const shipping = productJsonLd(product(), 'en', url, null).offers[0].shippingDetails
  assert.equal(shipping.shippingDestination.addressCountry, 'RS')
  assert.equal(shipping.shippingRate.value, 300)
  assert.equal(shipping.shippingRate.currency, 'RSD')
  assert.equal(shipping.deliveryTime.transitTime.maxValue, 7)
  assert.equal(shipping.deliveryTime.transitTime.unitCode, 'DAY')
  assert.equal('handlingTime' in shipping.deliveryTime, false)
  const other = productJsonLd(product({ calculated_amount: 15, currency_code: 'eur' }), 'en', url, null)
  assert.equal('shippingDetails' in other.offers[0], false)
})
