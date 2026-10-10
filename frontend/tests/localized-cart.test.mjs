import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from '../test-support/component-harness.mjs'
const { localizeCart } = load('frontend/src/lib/cart/localized-cart.ts', {
  '@/lib/i18n/content': load('frontend/src/lib/i18n/content.ts'),
})
const original = { id: 'cart', total: 1480, items: [{ id: 'line', product_id: 'hat', product_title: 'Зимова шапка', product_handle: 'rozetka-old', quantity: 1, total: 1480 }] }
test('cart uses current translated title and handle without altering prices or snapshots', () => {
 const translated = localizeCart(original, [{id:'hat',title:'Zimska kapa',handle:'zimska-kapa'}], 'sr')
 assert.equal(translated.items[0].product_title, 'Zimska kapa')
 assert.equal(translated.items[0].product_handle, 'zimska-kapa')
 assert.equal(translated.items[0].total, 1480)
 assert.equal(original.items[0].product_title, 'Зимова шапка')
 assert.equal(localizeCart(original, [{id:'hat',title:'Winter hat',handle:'zimska-kapa'}], 'en').items[0].product_title, 'Winter hat')
})
test('unavailable products keep usable snapshots and legacy metadata translations remain supported', () => {
 assert.equal(localizeCart(null, [], 'sr'), null)
 assert.equal(localizeCart(original, [], 'sr').items[0], original.items[0])
 const p = {id:'hat',title:'Source',handle:'hat',metadata:{i18n:{sr:{title:'Kapa'}}}}
 assert.equal(localizeCart(original, [p], 'sr').items[0].product_title, 'Kapa')
})

test('cart variant uses localized option values and preserves the server snapshot and totals', () => {
 const cart = {...original,items:[{...original.items[0],variant_id:'v1',variant_title:'One Size / Grey'}]}
 const product = {id:'hat',title:'Kapa',handle:'kapa',variants:[{id:'other',options:[{value:'XL'}]},{id:'v1',title:'One Size / Grey',options:[{value:'Jedna veličina'},{value:'Siva'}]}]}
 const sr = localizeCart(cart,[product],'sr')
 assert.equal(sr.items[0].variant_title,'Jedna veličina / Siva')
 assert.equal(sr.items[0].quantity,1)
 assert.equal(sr.items[0].total,1480)
 assert.equal(cart.items[0].variant_title,'One Size / Grey')
 const en = {...product,variants:[{id:'v1',options:[{value:'One Size'},{value:'Gray'}]}]}
 assert.equal(localizeCart(cart,[en],'en').items[0].variant_title,'One Size / Gray')
 assert.equal(localizeCart(cart,[{...product,variants:[]}],'sr').items[0].variant_title,'One Size / Grey')
})

test('locale lookup ignores stale responses and does not refetch on quantity changes', async () => {
 const { hooks } = await import('../test-support/component-harness.mjs')
 const state=hooks(), pending=[]
 let locale='sr', lastCleanup
 const react={...state.react,useEffect(fn,deps){state.react.useEffect(()=>{lastCleanup?.();lastCleanup=fn()},deps)}}
 const {useLocalizedCart}=load('frontend/src/components/cart/useLocalizedCart.ts',{
  react,'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale})},
  '@/lib/i18n/config':{medusaStoreLocale:l=>l==='sr'?'sr-RS':'en'},
  '@/lib/medusa':{sdk:{client:{fetch:(_path,options)=>new Promise(resolve=>pending.push({options,resolve}))}}},
  '@/lib/cart/localized-cart':{localizeCart},
 },{AbortController})
 const render=(cart=original)=>state.render(()=>useLocalizedCart(cart))
 render();await state.flush();assert.equal(pending.length,1)
 assert.equal(pending[0].options.headers['x-medusa-locale'],'sr-RS')
 locale='en';render();await state.flush();assert.equal(pending[0].options.signal.aborted,true)
 pending[1].resolve({products:[{id:'hat',title:'Winter hat',handle:'winter-hat'}]});await state.flush()
 assert.equal(render().items[0].product_title,'Winter hat')
 pending[0].resolve({products:[{id:'hat',title:'Kapa',handle:'kapa'}]});await state.flush()
 assert.equal(render().items[0].product_title,'Winter hat')
 render({...original,items:[{...original.items[0],quantity:2}]});await state.flush();assert.equal(pending.length,2)
 lastCleanup?.()
})
