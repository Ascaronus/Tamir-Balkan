import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {load,hooks,find} from '../test-support/component-harness.mjs'
import * as config from '../src/lib/i18n/config.ts'
import * as translator from '../src/lib/i18n/translator.ts'
const messages=Object.fromEntries(['sr','en'].map(locale=>[locale,JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url),'utf8'))]))
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function effectHooks(){
 const h=hooks()
 return {...h,react:{...h.react,useEffect(fn,deps){const ref=h.react.useRef();h.react.useEffect(()=>{ref.current?.();ref.current=fn()},deps)}}}
}
function wishlistFixture(initial){
 const h=effectHooks(),requests=[]
 let ids=initial,locale='sr',customer={id:'customer_a'}
 const {WishlistPage}=load('frontend/src/components/wishlist/WishlistPage.tsx',{
  react:h.react,'@/components/auth/AuthProvider':{useAuth:()=>({customer,isReady:true})},
  '@/components/auth/LoginDialog':{},'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale,t:translator.createTranslator(messages[locale])})},
  '@/components/i18n/LocalizedLink':{default:'Link'},'@/components/store/ProductCard':{ProductCard:'Card'},'./FavoriteButton':{FavoriteButton:'Heart'},
  './WishlistProvider':{useWishlist:()=>({ids,ready:true,error:false})},
  '@/lib/store/products':{listProductsByCountry:options=>{const request={...deferred(),options};requests.push(request);return request.promise}},
  '@/lib/store/commerce':{canPurchase:()=>true,variantAmount:()=>100},
 },{AbortController})
 const render=()=>h.render(WishlistPage)
 const settle=async(index=0)=>{requests[index].resolve({products:requests[index].options.ids.filter(id=>id!=='missing').map(id=>({id,title:id,metadata:{en_content_ready:true,en_handle:id},variants:[]}))});await h.flush()}
 return {h,requests,render,settle,setIds:next=>ids=next,setLocale:next=>locale=next,setCustomer:next=>customer=next,card:id=>find(render(),n=>n.type==='Card'&&n.props.product.id===id)}
}
test('component: wishlist deletion preserves remaining card data and issues no catalogue reload',async()=>{
 const f=wishlistFixture(['a','b','missing']);f.render();await f.h.flush();await f.settle()
 const original=f.card('b');assert.equal(original.key,'b')
 f.setIds(['b','missing']);const tree=f.render()
 assert.ok(find(tree,n=>n.props?.className==='product-grid'));assert.equal(f.card('b').props.product,original.props.product)
 await f.h.flush();assert.equal(f.requests.length,1)
 f.setIds(['b']);f.render();await f.h.flush();assert.equal(f.requests.length,1)
 f.setIds([]);assert.ok(JSON.stringify(f.render()).includes(messages.sr.wishlist.empty))
})
test('component: wishlist page refill requests only its new item and keeps cards on request failure',async()=>{
 const ids=Array.from({length:25},(_,i)=>`p${i}`),f=wishlistFixture(ids)
 f.render();await f.h.flush();await f.settle();const kept=f.card('p1').props.product
 f.setIds(ids.slice(1));f.render();await f.h.flush()
 assert.deepEqual([...f.requests[1].options.ids],['p24']);assert.equal(f.card('p1').props.product,kept)
 f.requests[1].reject(Error('offline'));await f.h.flush()
 assert.ok(find(f.render(),n=>n.props?.role==='alert'));assert.equal(f.card('p1').props.product,kept)
 await f.h.flush();assert.equal(f.requests.length,2)
 find(f.render(),n=>n.type==='button'&&n.props.children===messages.sr.common.retry).props.onClick()
 f.render();await f.h.flush();await f.settle(2)
 assert.ok(f.card('p24'));assert.equal(find(f.render(),n=>n.props?.role==='alert'),null)
})
test('component: wishlist discards late responses after account or locale changes',async()=>{
 const f=wishlistFixture(['a']);f.render();await f.h.flush()
 f.setCustomer({id:'customer_b'});f.setIds(['b']);f.render();await f.h.flush()
 assert.equal(f.requests[0].options.signal.aborted,true)
 await f.settle(1);await f.settle(0);assert.ok(f.card('b'));assert.equal(f.card('a'),null)
 f.setLocale('en');assert.equal(f.card('b'),null);await f.h.flush();await f.settle(2)
 assert.equal(f.requests[2].options.locale,'en');assert.ok(f.card('b'))
})
test('component: cart deletion keeps translated remaining items and fetches only new products',async()=>{
 const h=effectHooks(),requests=[]
 const localize=load('frontend/src/lib/cart/localized-cart.ts',{'@/lib/i18n/content':load('frontend/src/lib/i18n/content.ts')})
 const {useLocalizedCartState}=load('frontend/src/components/cart/useLocalizedCart.ts',{
  react:h.react,'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'sr'})},'@/lib/i18n/config':config,
  '@/lib/cart/localized-cart':localize,'@/lib/medusa':{sdk:{client:{fetch:(_url,options)=>{const request={...deferred(),options};requests.push(request);return request.promise}}}},
 },{AbortController})
 const cart=ids=>({id:'cart_a',total:200,items:ids.map(id=>({id:`line_${id}`,product_id:id,title:'Source',quantity:1,total:100}))})
 const render=ids=>h.render(()=>useLocalizedCartState(cart(ids)))
 render(['a','b']);await h.flush();requests[0].resolve({products:[{id:'a',title:'Kapa',handle:'a'},{id:'b',title:'Šal',handle:'b'}]});await h.flush()
 let state=render(['b']);assert.equal(state.ready,true);assert.equal(state.cart.items[0].product_title,'Šal')
 await h.flush();assert.equal(requests.length,1)
 state=render(['b','c']);assert.equal(state.cart.items[0].product_title,'Šal');await h.flush()
 assert.deepEqual([...requests[1].options.query.id],['c'])
 requests[1].resolve({products:[{id:'c',title:'Kaiš',handle:'c'}]});await h.flush()
 assert.equal(render(['b','c']).cart.items[1].product_title,'Kaiš')
})
test('component: persistent locale provider follows URL and back navigation despite old root props',async()=>{
 const h=hooks(),calls=[],document={documentElement:{lang:'sr'}};let path='/rs'
 const {LocaleProvider}=load('frontend/src/components/i18n/LocaleProvider.tsx',{
  react:{...h.react,useLayoutEffect:h.react.useEffect},'next/navigation':{usePathname:()=>path},
  '@/lib/i18n/config':config,'@/lib/i18n/messages':{getMessages:locale=>messages[locale]},'@/lib/i18n/translator':translator,
  '@/lib/i18n/locale-scroll':{restoreLocaleScroll:()=>calls.push('scroll')},'@/lib/medusa':{sdk:{client:{setLocale:locale=>calls.push(locale)}}},
 },{document})
 const render=()=>h.render(()=>LocaleProvider({locale:'sr',messages:messages.sr,children:'page'}))
 render();await h.flush();assert.equal(document.documentElement.lang,'sr')
 path='/en/cart';let value=render().props.value;assert.equal(value.locale,'en');assert.equal(value.t('checkout.shipping'),messages.en.checkout.shipping)
 await h.flush();assert.equal(document.documentElement.lang,'en');assert.ok(calls.includes('en'))
 path='/rs/korpa';value=render().props.value;await h.flush();assert.equal(value.locale,'sr');assert.equal(document.documentElement.lang,'sr')
 assert.ok(calls.includes('sr-RS'))
})

test('component: cart revalidates on entry without blanking, skips locale-only navigation and clears on reset',async()=>{
 const h=effectHooks(),requests=[],events=new Map();let path='/rs'
 const stableCallback=(fn,deps)=>{const ref=h.react.useRef();if(!ref.current||deps.some((d,i)=>d!==ref.current.deps[i]))ref.current={fn,deps};return ref.current.fn}
 const {CartProvider}=load('frontend/src/components/cart/CartProvider.tsx',{
  react:{...h.react,useCallback:stableCallback},'next/navigation':{usePathname:()=>path},
  '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:path.startsWith('/en')?'en':'sr'})},
  '@/components/auth/AuthProvider':{useAuth:()=>({isReady:true})},
  '@/lib/cart/cart-client':{getOrCreateCart:()=>{const request=deferred();requests.push(request);return request.promise}},
  '@/lib/store/commerce':{stableItems:items=>items},'./AddedToCartDialog':{},
  './useLocalizedCart':{useLocalizedCartState:cart=>({cart,ready:true,error:false,retry(){}})},
 },{window:{addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)}})
 const render=()=>h.render(()=>CartProvider({countryCode:'rs',children:'page'})).props.value
 render();await h.flush();requests[0].resolve({id:'cart_a',items:[{id:'a',quantity:1}],total:100});await h.flush()
 assert.equal(render().isReady,true);path='/rs/korpa';render();await h.flush()
 assert.equal(requests.length,2);assert.equal(render().cart.total,100);assert.equal(render().isReady,true)
 path='/en/cart';render();await h.flush();assert.equal(requests.length,2)
 events.get('tb-cart-reset')();assert.equal(render().cart,null);assert.equal(render().isReady,false)
 requests[1].resolve({id:'cart_a',items:[{id:'a',quantity:1}],total:999});await h.flush()
 assert.equal(render().cart,null);assert.equal(requests.length,3)
 requests[2].resolve({id:'cart_b',items:[],total:0});await h.flush()
 assert.equal(render().cart.id,'cart_b');assert.equal(render().isReady,true)
})
