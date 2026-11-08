import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load, hooks, find } from '../test-support/component-harness.mjs'
import { createTranslator } from '../src/lib/i18n/translator.ts'
import * as images from '../src/lib/product-image.ts'
import * as commerce from '../src/lib/store/commerce.ts'
import * as content from '../src/lib/i18n/content.ts'
import * as backdrop from '../src/lib/dialog-backdrop.ts'

const touch = (x, y, id = 1) => ({ clientX: x, clientY: y, identifier: id })
const event = (touches, changedTouches = touches, timeStamp = 100) => ({ touches, changedTouches, timeStamp })
function fixture(locale = 'sr', imageCount = 3, overrides = {}) {
  const h = hooks(), t = createTranslator(JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), 'utf8')))
  const swipe = load('frontend/src/components/product/useImageSwipe.ts', { react: h.react })
  const variant = { id: 'v1', title: 'First', manage_inventory: false, calculated_price: { calculated_amount: 1200, currency_code: 'rsd' }, ...overrides.variant }
  const cartState = { cart: null, isReady: true, isMutating: false, ...overrides.cart }
  const props = { product: { id: 'p1', title: 'Šešir', handle: 'hat', images: Array.from({ length: imageCount }, (_, i) => ({ id: `img${i}`, url: `https://images.example.test/${i}.webp` })), variants: [variant, { ...variant, id: 'v2', title: 'Second' }] } }
  const { ProductDetails } = load('frontend/src/components/product/ProductDetails.tsx', {
    react: h.react, './useImageSwipe': swipe, '@/lib/dialog-backdrop': backdrop,
    '@/components/wishlist/FavoriteButton': { FavoriteButton: 'FavoriteButton' },
    './ProductDelivery': { ProductDelivery: 'ProductDelivery' }, './ProductAttributes': { ProductAttributes: 'ProductAttributes' },
    '@/components/store/ColorSwatch': { ColorSwatch: 'ColorSwatch' }, '@/components/store/ProductImage': { ProductImage: 'ProductImage' },
    '@/components/i18n/LocalizedLink': { default: 'a' }, 'next/navigation': { useSearchParams: () => ({ get: () => null }) },
    '@/components/auth/AuthProvider': { useAuth: () => ({ customer: null, isReady: true }) },
    '@/components/cart/CartProvider': { useCart: () => cartState },
    '@/lib/cart/useVariantStock': { useVariantStock: () => overrides.stock ?? {} },
    '@/components/i18n/LocaleProvider': { useLocaleContext: () => ({ locale, t }) },
    '@/lib/product-image': images, '@/lib/store/commerce': commerce, '@/lib/i18n/content': content,
    '@/lib/format-money': { formatMoney: String }, '@/lib/seo/product': { productBrand: () => null },
    '@/lib/store/catalog': {}, '@/lib/store/products': {},
  }, { window: { location: { href: 'https://tamir.rs/products/hat' }, history: { replaceState() {} } } })
  let opened = 0
  const render = () => h.render(() => { const selection = ProductDetails(props).props.children[0]; return selection.type(selection.props) })
  const hero = () => find(render(), n => n.type === 'button' && n.props['aria-label'] === t('product.zoom'))
  const enlarged = () => find(render(), n => n.type === 'div' && n.props.className?.startsWith('product-swipe-surface'))
  const dialog = () => find(render(), n => n.type === 'dialog')
  dialog().props.ref.current = { showModal() { opened++ }, close() {} }
  const src = () => find(hero(), n => n.type === 'ProductImage').props.src
  const click = (detail = 1, timeStamp = 300) => {
    const el = hero(); let stopped = false
    el.props.onClickCapture({ detail, timeStamp, preventDefault() {}, stopPropagation() { stopped = true } })
    if (!stopped) el.props.onClick()
    return stopped
  }
  const drag = (surface, from, to) => {
    const el = surface(); el.props.onTouchStart(event([from])); el.props.onTouchMove(event([to], [to], 150)); el.props.onTouchEnd(event([], [to], 200))
  }
  return { render, hero, enlarged, dialog, src, drag, click, t, cartState, opened: () => opened }
}

for(const locale of ['sr','en']) test(`product ${locale}: plus shows the stock limit before any addition, including items already in cart`,()=>{
  const calls=[],f=fixture(locale,1,{variant:{manage_inventory:true,inventory_quantity:20},stock:{v1:5},cart:{cart:{items:[{variant_id:'v1',quantity:3}]},addItem:async(...args)=>calls.push(args)}})
  const input=()=>find(f.render(),n=>n.props?.id==='product-quantity')
  const plus=()=>find(f.render(),n=>n.props?.['aria-label']===f.t('cartPage.increaseQty'))
  assert.equal(find(f.render(),n=>n.props?.className?.startsWith('product-stock')).props.children,locale==='sr'?'Na stanju':'In stock')
  assert.equal(find(f.render(),n=>n.props?.role==='alert'),null)
  assert.equal(input().props.max,undefined)
  plus().props.onClick();assert.equal(input().props.value,2)
  assert.equal(find(f.render(),n=>n.props?.role==='alert'),null)
  plus().props.onClick();assert.equal(input().props.value,2)
  assert.equal(find(f.render(),n=>n.props?.role==='alert').props.children,f.t('product.stockLimit',{n:5,inCart:3}))
  assert.deepEqual(calls,[])
  input().props.onChange({target:{value:'1'}});assert.equal(find(f.render(),n=>n.props?.role==='alert'),null)
  input().props.onChange({target:{value:'50'}});assert.equal(input().props.value,2)
  assert.ok(find(f.render(),n=>n.props?.role==='alert'))
  find(f.render(),n=>n.type==='select').props.onChange({target:{value:'v2'}})
  assert.equal(input().props.value,1);assert.equal(find(f.render(),n=>n.props?.role==='alert'),null)
})
for(const options of [
  {variant:{manage_inventory:true,inventory_quantity:1}},
  {variant:{manage_inventory:true,inventory_quantity:10},stock:{v1:1}},
  {variant:{manage_inventory:true,inventory_quantity:5},cart:{cart:{items:[{variant_id:'v1',quantity:4}]}}},
]) test('product with one available unit disables both controls and manual editing',()=>{
  const f=fixture('en',1,options),tree=f.render()
  for(const key of ['increaseQty','decreaseQty'])assert.equal(find(tree,n=>n.props?.['aria-label']===f.t('cartPage.'+key)).props.disabled,true)
  assert.equal(find(tree,n=>n.props?.id==='product-quantity').props.disabled,true)
  assert.equal(find(tree,n=>n.props?.className?.includes('button-primary')).props.disabled,false)
  assert.equal(find(tree,n=>n.props?.role==='alert'),null)
})
test('unmanaged and backorder stock are not capped; server stock failures remain visible',async()=>{
  for(const variant of [{manage_inventory:false},{manage_inventory:true,allow_backorder:true,inventory_quantity:0}]){
    const f=fixture('en',1,{variant});const input=()=>find(f.render(),n=>n.props?.id==='product-quantity')
    input().props.onChange({target:{value:'99'}});assert.equal(input().props.value,99)
    assert.equal(find(f.render(),n=>n.props?.role==='alert'),null)
  }
  const f=fixture('en',1,{variant:{manage_inventory:true,inventory_quantity:5}})
  f.cartState.addItem=async()=>{f.cartState.stockError={variantId:'v1',available:0,inCart:0};throw Error('stock changed')}
  await find(f.render(),n=>n.props?.className?.includes('button-primary')).props.onClick()
  assert.equal(find(f.render(),n=>n.props?.role==='alert').props.children,f.t('product.stockLimit',{n:0,inCart:0}))
})
for (const locale of ['sr', 'en']) {
  test(`component: ${locale} main and enlarged images swipe in both directions and wrap`, () => {
    const f = fixture(locale)
    for (const surface of [f.hero, f.enlarged]) {
      assert.match(f.src(), /0.webp$/)
      f.drag(surface, touch(200, 100), touch(70, 105)); assert.match(f.src(), /1.webp$/)
      f.drag(surface, touch(70, 100), touch(200, 105)); assert.match(f.src(), /0.webp$/)
      f.drag(surface, touch(70, 100), touch(200, 105)); assert.match(f.src(), /2.webp$/)
      f.drag(surface, touch(200, 100), touch(70, 105)); assert.match(f.src(), /0.webp$/)
    }
    assert.equal(f.opened(), 0)
  })
  test(`component: ${locale} swipe does not open zoom; tap and keyboard still do`, () => {
    const f = fixture(locale)
    f.drag(f.hero, touch(200, 100), touch(70, 105)); assert.equal(f.click(), true); assert.equal(f.opened(), 0)
    f.drag(f.hero, touch(100, 100), touch(102, 103)); assert.equal(f.click(), false); assert.equal(f.opened(), 1)
    f.drag(f.hero, touch(200, 100), touch(70, 105)); assert.equal(f.click(0), false); assert.equal(f.opened(), 2)
    f.drag(f.hero, touch(200, 100), touch(70, 105)); assert.equal(f.click(1, 1000), false); assert.equal(f.opened(), 3)
  })
}
test('component: vertical, diagonal and short movements do not change photos or open zoom', () => {
  for (const end of [touch(195, 250), touch(80, 240), touch(170, 100)]) {
    const f = fixture(); f.drag(f.hero, touch(200, 100), end)
    assert.match(f.src(), /0.webp$/); assert.equal(f.click(), true); assert.equal(f.opened(), 0)
  }
})
test('component: canceled, multi-touch and interrupted vertical gestures do not change photos', () => {
  for (const mode of ['cancel', 'pinch', 'vertical']) {
    const f = fixture(), el = f.hero(); el.props.onTouchStart(event([touch(200, 100)]))
    if (mode === 'cancel') el.props.onTouchCancel(event([], [], 150))
    if (mode === 'pinch') el.props.onTouchStart(event([touch(200, 100), touch(300, 100, 2)], [], 150))
    if (mode === 'vertical') el.props.onTouchMove(event([touch(200, 130)], [], 150))
    el.props.onTouchEnd(event([], [touch(70, 135)], 200))
    assert.match(f.src(), /0.webp$/); assert.equal(f.click(), true)
    f.drag(f.hero, touch(200, 100), touch(70, 100)); assert.match(f.src(), /1.webp$/)
  }
})
test('component: variant change resets gallery and invalidates a gesture started on previous image', () => {
  const f = fixture(); f.drag(f.hero, touch(200, 100), touch(70, 100)); assert.match(f.src(), /1.webp$/)
  f.hero().props.onTouchStart(event([touch(200, 100)]))
  find(f.render(), n => n.type === 'select').props.onChange({ target: { value: 'v2' } })
  f.hero().props.onTouchEnd(event([], [touch(70, 100)], 200)); assert.match(f.src(), /0.webp$/)
})
test('component: single/empty galleries stay valid and thumbnail/keyboard navigation still works', () => {
  for (const count of [0, 1]) {
    const f = fixture('sr', count); f.drag(f.hero, touch(200, 100), touch(70, 100)); assert.equal(f.src(), count ? 'https://images.example.test/0.webp' : undefined)
    assert.equal(f.hero().props.disabled, count === 0)
  }
  const f = fixture(); find(f.render(), n => n.type === 'button' && n.props['aria-label'] === f.t('product.photoNumber', { n: 3 })).props.onClick(); assert.match(f.src(), /2.webp$/)
  let prevented = false; f.dialog().props.onKeyDown({ key: 'ArrowRight', preventDefault() { prevented = true } }); assert.equal(prevented, true); assert.match(f.src(), /0.webp$/)
})
