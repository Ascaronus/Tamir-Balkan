import test from 'node:test'
import assert from 'node:assert/strict'
import { load, hooks, find } from '../test-support/component-harness.mjs'
import * as config from '../src/lib/i18n/config.ts'

function browser({ y = 0, blocked = false, ready = 'complete' } = {}) {
 const storage = new Map(), scrolls = [], urls = [], events = new Map(), frames = new Map()
 let nextFrame = 0
 const window = {
  location: { origin: 'https://tamir.rs', pathname: '/rs', search: '?page=2', hash: '#catalog-products', assign: url => urls.push(url) },
  scrollX: 0, scrollY: y,
  sessionStorage: {
   setItem: (key, value) => { if (blocked) throw Error('Storage blocked'); storage.set(key, value) },
   getItem: key => { if (blocked) throw Error('Storage blocked'); return storage.get(key) ?? null },
   removeItem: key => storage.delete(key),
  },
  history: { state: { next: true }, replaceState: (state, title, url) => { assert.equal(state.next, true); urls.push(url) } },
  scrollTo: options => scrolls.push(options),
  requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame },
  cancelAnimationFrame: id => frames.delete(id),
  addEventListener: (name, callback) => events.set(name, callback),
  removeEventListener: (name, callback) => { if (events.get(name) === callback) events.delete(name) },
 }
 const document = { readyState: ready }
 const api = load('frontend/src/lib/i18n/locale-scroll.ts', {}, { window, document })
 return { ...api, window, document, storage, scrolls, urls, events, frames,
  flush: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()) } }
}
for (const [path, y] of [['/en?page=2#catalog-products', 0], ['/rs?page=2#catalog-products', 840], ['/en/products/hat?v_id=variant_1#reviews', 650]]) {
 test(`unit: locale navigation preserves position ${y} and restores ${path} without anchor navigation`, () => {
  const b = browser({ y }); b.navigateWithLocaleScroll(path)
  assert.equal(b.urls[0], path.split('#')[0])
  const target = new URL(path, b.window.location.origin)
  Object.assign(b.window.location, { pathname: target.pathname, search: target.search, hash: '' })
  b.restoreLocaleScroll(); b.flush(); assert.equal(b.urls[1], path); assert.equal(b.scrolls.length, 2)
  for (const scroll of b.scrolls) { assert.equal(scroll.top, y); assert.equal(scroll.left, 0); assert.equal(scroll.behavior, 'instant') }
  assert.equal(b.storage.size, 0); b.restoreLocaleScroll(); assert.equal(b.scrolls.length, 2)
 })
}
test('unit: restore waits for document layout and supports effect cleanup/remount', () => {
 const b = browser({ y: 500, ready: 'loading' }); b.navigateWithLocaleScroll('/rs?page=2#catalog-products')
 const cleanup = b.restoreLocaleScroll(); cleanup(); assert.equal(b.events.size, 0); assert.equal(b.storage.size, 1)
 b.restoreLocaleScroll(); b.events.get('load')(); b.flush(); assert.equal(b.scrolls.at(-1).top, 500); assert.equal(b.storage.size, 0)
})
test('unit: unrelated pages and expired locale positions never change scroll', () => {
 for (const mode of ['other-page', 'expired']) {
  const b = browser(); b.navigateWithLocaleScroll('/en')
  if (mode === 'expired') {
   b.window.location.pathname = '/en'; b.window.location.search = ''
   const [key, raw] = [...b.storage][0]; const record = JSON.parse(raw); record.savedAt -= 61_000; b.storage.set(key, JSON.stringify(record))
  }
  b.restoreLocaleScroll(); assert.equal(b.scrolls.length, 0); assert.equal(b.storage.size, 0)
 }
})
test('unit: restricted storage still changes language without jumping to an anchor', () => {
 const b = browser({ blocked: true }); b.navigateWithLocaleScroll('/en#catalog-products'); b.restoreLocaleScroll()
 assert.equal(b.urls[0], '/en'); assert.equal(b.scrolls.length, 0)
})
for (const locale of ['sr', 'en']) test(`component: ${locale} current language is a no-op and failed switch does not navigate`, async () => {
 const h = hooks(); let requests = 0, navigations = 0
 const { LanguageSwitcher } = load('frontend/src/components/i18n/LanguageSwitcher.tsx', {
  react: h.react, './LanguagePaths': { useLanguagePaths: () => ({}) },
  'next/navigation': { usePathname: () => locale === 'sr' ? '/rs' : '/en' },
  '@/lib/i18n/config': config, '@/components/i18n/LocaleProvider': { useLocaleContext: () => ({ locale, t: key => key }) },
  '@/lib/medusa': { sdk: { client: { setLocale: () => {} } } },
  '@/lib/i18n/locale-scroll': { navigateWithLocaleScroll: () => navigations++ },
 }, { fetch: async () => { requests++; return { ok: false } } })
 const render = () => h.render(LanguageSwitcher)
 await find(render(), n => n.type === 'button' && n.props.children === locale).props.onClick()
 assert.equal(requests, 0); assert.equal(navigations, 0)
 await find(render(), n => n.type === 'button' && n.props.children !== locale).props.onClick()
 assert.equal(requests, 1); assert.equal(navigations, 0); assert.ok(find(render(), n => n.props?.role === 'alert'))
})
