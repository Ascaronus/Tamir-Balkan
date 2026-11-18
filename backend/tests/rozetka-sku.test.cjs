const { test } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { skuToken, articleFromOfferUrl, isOneSize, legacySkuFromOffer, rozetkaSku } = require('../src/utils/rozetka')
const { parseFeed } = require('../src/utils/rozetka-preview')
const { initialDraft, draftErrors } = require('../src/shared/rozetka-import')

// TB-24: the Rozetka SKU must be `АРТИКУЛ-РАЗМЕР` built from the `<url>` article,
// not from the offer id. The offer id remains `legacy_sku` for tracing and for
// sources whose url carries no Latin article.

test('articleFromOfferUrl takes the last path segment of the offer url', () => {
  assert.equal(articleFromOfferUrl('https://tamir.ua/aksessuary/sharfy/baf-tmr-1black.html'), 'BAF-TMR-1BLACK')
  assert.equal(articleFromOfferUrl('https://tamir.ua/odezhda/shtani/shtani-tmr-2211m43021-siri'), 'SHTANI-TMR-2211M43021-SIRI')
  assert.equal(articleFromOfferUrl('https://tamir.ua/hats/x-1.htm'), 'X-1')
})

test('articleFromOfferUrl ignores query, fragment, nesting and trailing slashes', () => {
  assert.equal(articleFromOfferUrl('https://tamir.ua/hats/model.html?size=58#top'), 'MODEL')
  assert.equal(articleFromOfferUrl('https://tamir.ua/model.html#frag?x=y'), 'MODEL')
  assert.equal(articleFromOfferUrl('https://tamir.ua/a/b/c/d/e/deep-article.html'), 'DEEP-ARTICLE')
  assert.equal(articleFromOfferUrl('https://tamir.ua/model/'), 'MODEL')
})

test('articleFromOfferUrl works with relative feed paths and rejects non-Latin articles', () => {
  assert.equal(articleFromOfferUrl('/odezhda/shtani/shtani-tmr-2211-siri.html'), 'SHTANI-TMR-2211-SIRI')
  assert.equal(articleFromOfferUrl('/shtani.html?size=48'), 'SHTANI')
  assert.equal(articleFromOfferUrl('shtani-tmr-2211-siri.html'), 'SHTANI-TMR-2211-SIRI')
  // Percent-encoded and raw Cyrillic both decode to non-Latin: no safe article exists.
  assert.equal(articleFromOfferUrl('https://tamir.ua/ushyu/%D1%88%D0%B0%D0%BF%D0%BA%D0%B0.html'), '')
  assert.equal(articleFromOfferUrl('https://tamir.ua/ushyu/шапка-красная.html'), '')
})

test('articleFromOfferUrl returns an empty string for empty or missing urls', () => {
  for (const url of ['', '   ', undefined, null]) assert.equal(articleFromOfferUrl(url), '')
})

test('skuToken uppercases, keeps Latin alphanumerics and collapses everything else into one dash', () => {
  assert.equal(skuToken('baf-tmr-1black'), 'BAF-TMR-1BLACK')
  assert.equal(skuToken('3XL'), '3XL')
  assert.equal(skuToken('Šumadija 3xl'), 'SUMADIJA-3XL')
  assert.equal(skuToken('one   size!!!'), 'ONE-SIZE')
  // Cyrillic letters are not Latin: they collapse to a dash and then trim away,
  // which is exactly why such urls fall back to the id-based SKU instead.
  assert.equal(skuToken('Размер 48'), '48')
  assert.equal(skuToken('шапка'), '')
})

test('isOneSize recognizes the "no size dimension" spellings and nothing else', () => {
  for (const size of ['', '   ', undefined, 'One size', 'one_size', 'OS', 'OneSize', 'без размера', 'ONE SIZE'])
    assert.ok(isOneSize(size), `${size} must mean "one size"`)
  for (const size of ['48', 'M', '28', '58-60', 'XXL'])
    assert.ok(!isOneSize(size), `${size} is a real size`)
})

test('legacySkuFromOffer keeps the previous offer-id formula for tracing', () => {
  assert.equal(legacySkuFromOffer({ id: '5c73d4b3-cba4-11eb-ab3c-8a74aeb6a5b6_3a3db20e-11ec-a298-4298adb44b20' }),
    '5C73D4B3-CBA4-11EB-AB3C-8A74AEB6A5B6-3A3DB20E-11EC-A298-4298ADB44B20')
  assert.equal(legacySkuFromOffer({ id: 'a' }), 'A')
})

test('rozetkaSku joins the url article with the size in upper case', () => {
  const shtani = { id: '5c73d4b3-cba4-11eb-ab3c-8a74aeb6a5b6_3a3db20e-11ec-a298-4298adb44b20', url: 'https://tamir.ua/odezhda/shtani/shtani-tmr-2211m43021-siri.html' }
  assert.equal(rozetkaSku(shtani, '48'), 'SHTANI-TMR-2211M43021-SIRI-48')
  const baf = { id: 'x_1', url: 'https://tamir.ua/aksessuary/sharfy/baf-tmr-1black.html' }
  assert.equal(rozetkaSku(baf, 'One Size'), 'BAF-TMR-1BLACK')
  assert.equal(rozetkaSku(baf, ''), 'BAF-TMR-1BLACK')
})

test('rozetkaSku gives every size of one product its own SKU and is idempotent', () => {
  const shtani = { id: 'id-1', url: 'https://tamir.ua/odezhda/shtani/shtani-tmr-2211m43021-siri.html' }
  const skus = new Set(['48', '50', '52'].map(size => rozetkaSku(shtani, size)))
  assert.deepEqual([...skus], ['SHTANI-TMR-2211M43021-SIRI-48', 'SHTANI-TMR-2211M43021-SIRI-50', 'SHTANI-TMR-2211M43021-SIRI-52'])
  assert.equal(rozetkaSku(shtani, '48'), rozetkaSku(shtani, '48'))
  assert.equal(rozetkaSku(shtani, '48'), rozetkaSku(shtani, ' 48 '))
})

test('rozetkaSku falls back to the legacy id SKU when the url has no Latin article', () => {
  const offer = { id: '5c73d4b3-cba4-11eb-ab3c-8a74aeb6a5b6_3a3db20e-11ec-a298-4298adb44b20', url: 'https://tamir.ua/ushyu/шапка-красная.html' }
  assert.equal(rozetkaSku(offer, '58'), legacySkuFromOffer(offer))
  assert.equal(rozetkaSku({ id: 'id-2', url: 'https://tamir.ua/model.html' }, '???'), 'ID-2')
})

// Realistic live-feed shape: two multi-size products and one One Size accessory,
// with `<offer id>` values of the `uuid_uuid` form Rozetka actually exports.
const SHAPKA_48_ID = '5c73d4b3-cba4-11eb-ab3c-8a74aeb6a5b6_3a3db20e-11ec-a298-4298adb44b20'
const SHAPKA_50_ID = '5c73d4b3-cba4-11eb-ab3c-8a74aeb6a5b6_77ce4a12-11ec-b310-0a5d3f9c2b41'
const SHTANI_48_ID = '9f01be77-cba4-11eb-ab3c-8a74aeb6a5b6_31ad9c60-11ec-8a2f-2a2e2b1c9d55'
const SHTANI_50_ID = '9f01be77-cba4-11eb-ab3c-8a74aeb6a5b6_d2c58e14-11ec-9c41-e6b8a1f4c7a3'
const BAF_OS_ID = 'b1e07d52-cba5-11eb-ab3c-8a74aeb6a5b6_8b6f42de-11ec-9d02-5eaa7c31b8f9'
const OFFER = (id, url, name, sizeParam, price) =>
  `<offer id="${id}" available="true"><url>${url}</url><name>${name}</name><price>${price}</price>` +
  `<currencyId>UAH</currencyId><categoryId>12345</categoryId><picture>https://tamir.ua/images/${id.slice(0, 8)}.jpg</picture>` +
  `<description>Описание ${name}</description><stock_quantity>3</stock_quantity><param name="Размер">${sizeParam}</param></offer>`
const feedXml = '<!DOCTYPE yml_catalog SYSTEM "shops.dtd">' +
  '<yml_catalog><shop><categories><category id="12345">Одежда</category></categories><offers>' +
  OFFER(SHAPKA_48_ID, 'https://tamir.ua/odezhda/golovnye-ubory/shapka-tmr-d2burg.html', 'Шапка TAMIR D2burg 48', '48', '1790') +
  OFFER(SHAPKA_50_ID, 'https://tamir.ua/odezhda/golovnye-ubory/shapka-tmr-d2burg.html', 'Шапка TAMIR D2burg 50', '50', '1790') +
  OFFER(SHTANI_48_ID, 'https://tamir.ua/odezhda/shtani/shtani-tmr-2211m43021-siri.html', 'Штаны TAMIR 2211M43021 Siri 48', '48', '4990') +
  OFFER(SHTANI_50_ID, 'https://tamir.ua/odezhda/shtani/shtani-tmr-2211m43021-siri.html', 'Штаны TAMIR 2211M43021 Siri 50', '50', '4990') +
  OFFER(BAF_OS_ID, 'https://tamir.ua/aksessuary/sharfy/baf-tmr-1black.html', 'Баф TAMIR 1black', 'One Size', '1290') +
  '</offers></shop></yml_catalog>'

test('parseFeed builds article-based SKUs, keeps the id-based SKU as legacy_sku and attaches the article', () => {
  const feed = parseFeed(feedXml)
  assert.equal(feed.products.length, 3)
  const byArticle = new Map(feed.products.map(p => [p.variants[0].article, p]))
  const shapka = byArticle.get('SHAPKA-TMR-D2BURG'), shtani = byArticle.get('SHTANI-TMR-2211M43021-SIRI'), baf = byArticle.get('BAF-TMR-1BLACK')
  assert.equal(shapka.variants.length, 2); assert.equal(shtani.variants.length, 2); assert.equal(baf.variants.length, 1)

  assert.deepEqual(shapka.variants.map(v => v.sku), ['SHAPKA-TMR-D2BURG-48', 'SHAPKA-TMR-D2BURG-50'])
  assert.deepEqual(shtani.variants.map(v => v.sku), ['SHTANI-TMR-2211M43021-SIRI-48', 'SHTANI-TMR-2211M43021-SIRI-50'])
  assert.equal(baf.variants[0].sku, 'BAF-TMR-1BLACK')

  assert.equal(shtani.variants[0].id, SHTANI_48_ID)
  assert.equal(shtani.variants[0].legacy_sku, '9F01BE77-CBA4-11EB-AB3C-8A74AEB6A5B6-31AD9C60-11EC-8A2F-2A2E2B1C9D55')
  assert.equal(byArticle.get('BAF-TMR-1BLACK').variants[0].legacy_sku, 'B1E07D52-CBA5-11EB-AB3C-8A74AEB6A5B6-8B6F42DE-11EC-9D02-5EAA7C31B8F9')
  for (const [product, article] of [[shapka, 'SHAPKA-TMR-D2BURG'], [shtani, 'SHTANI-TMR-2211M43021-SIRI'], [baf, 'BAF-TMR-1BLACK']])
    for (const v of product.variants) assert.equal(v.article, article)

  // Live Rozetka names repeat the size: the parser removes it and keeps the model/article.
  assert.equal(shapka.title, 'Шапка TAMIR D2burg')
  assert.ok(!shapka.warnings.some(w => /артикул/i.test(w)))
})

test('article SKUs of different products never collide on a shared size and drafts validate clean', () => {
  const feed = parseFeed(feedXml)
  const allSkus = feed.products.flatMap(p => p.variants.map(v => v.sku))
  assert.equal(new Set(allSkus).size, allSkus.length)
  assert.ok(allSkus.includes('SHAPKA-TMR-D2BURG-48')); assert.ok(allSkus.includes('SHTANI-TMR-2211M43021-SIRI-48'))
  for (const product of feed.products) {
    const draft = initialDraft(product)
    draft.category_id = 'cat'
    draft.variants.forEach(v => { v.price = '1990'; v.stock = '2' })
    assert.deepEqual(draftErrors(draft), [])
  }
})
