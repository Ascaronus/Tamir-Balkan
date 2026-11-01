import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from '../test-support/component-harness.mjs'
import * as fetchTimeout from '../src/lib/store/fetch-timeout.ts'

const requests = []
const medusa = {
  sdk: {
    client: {
      fetch: async (path, options) => {
        requests.push({ path, options })
        if (path === '/store/regions') return { regions: [] }
        if (path === '/store/homepage-banners') return { slides: [] }
        return { product_categories: [], count: 0 }
      },
    },
  },
}
const regions = load('frontend/src/lib/store/regions.ts', {
  '@/lib/medusa': medusa,
  './fetch-timeout': fetchTimeout,
})
const categories = load('frontend/src/lib/store/categories.ts', {
  '@/lib/medusa': medusa,
  './fetch-timeout': fetchTimeout,
  './category-url': { matchesCategoryHandle: () => false },
  '@/lib/i18n/config': { medusaStoreLocale: (locale) => (locale === 'sr' ? 'sr-RS' : locale) },
})
const banners = load('frontend/src/lib/store/banners.ts', {
  '@/lib/medusa': medusa,
  './fetch-timeout': fetchTimeout,
  '@/lib/banners/shared/banner-model': { initialCarousel: { slides: [] } },
})

// `cache:'no-store'` рядом с `next.revalidate` победил бы и молча выключил кэш,
// поэтому проверяем и отсутствие ключа cache. Объекты из vm-харнеса другого
// реальма, поэтому сравнение поля за полем, без deepStrictEqual.
function cached(options, revalidate) {
  assert.equal(options.cache, undefined)
  assert.equal('cache' in options, false)
  assert.equal(options.next.revalidate, revalidate)
  assert.deepEqual(Object.keys(options.next), ['revalidate'])
  assert.ok(options.signal instanceof AbortSignal)
}

test('regions use the 60 s Next data cache instead of no-store', async () => {
  await regions.listRegions()
  const request = requests.at(-1)
  assert.equal(request.path, '/store/regions')
  cached(request.options, 60)
})

test('category list caches per locale via the ?locale= query, not a header', async () => {
  await categories.listStoreProductCategories('sr')
  const request = requests.at(-1)
  assert.equal(request.path, '/store/product-categories')
  assert.equal(request.options.query.locale, 'sr-RS')
  assert.equal(request.options.headers, undefined)
  cached(request.options, 60)

  await categories.listStoreProductCategories()
  assert.equal(requests.at(-1).options.query.locale, undefined)
})

test('single category fetch caches for 60 s and keys its locale in the query', async () => {
  await categories.getStoreProductCategoryById('cat_a', 'en')
  const request = requests.at(-1)
  assert.equal(request.options.query.id.length, 1)
  assert.equal(request.options.query.id[0], 'cat_a')
  assert.equal(request.options.query.locale, 'en')
  cached(request.options, 60)
})

test('homepage banners use the slowest 300 s cache and keep the static fallback', async () => {
  assert.deepEqual(await banners.homepageBanners(), { slides: [] })
  const request = requests.at(-1)
  assert.equal(request.path, '/store/homepage-banners')
  cached(request.options, 300)
})
