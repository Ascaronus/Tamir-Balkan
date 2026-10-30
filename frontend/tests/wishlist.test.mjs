import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { WishlistState } from '../src/lib/store/wishlist-state.ts'
import { localizedPath } from '../src/lib/i18n/paths.ts'
import { load, find, hooks } from '../test-support/component-harness.mjs'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
test('shared state loads once, synchronizes subscribers and suppresses concurrent double-click',async()=>{
 let reads=0,writes=0;const response=deferred(),write=deferred()
 const state=new WishlistState({list:()=>{reads++;return response.promise},set:()=>{writes++;return write.promise}})
 let card,header;state.subscribe(()=>card=state.getSnapshot());state.subscribe(()=>header=state.getSnapshot())
 const a=state.load(),b=state.load();assert.equal(reads,1);response.resolve([]);await Promise.all([a,b])
 const save=state.set('prod_a',true);await state.set('prod_a',true);assert.equal(writes,1);assert.deepEqual(card.pending,['prod_a'])
 write.resolve();await save;assert.deepEqual(card.ids,['prod_a']);assert.equal(card,header)
 await state.set('prod_a',false);assert.deepEqual(header.ids,[])
})
test('failed save retains confirmed heart/count; disposed account rejects late response',async()=>{
 const response=deferred();const state=new WishlistState({list:async()=>['prod_a'],set:()=>response.promise})
 await state.load();const save=state.set('prod_a',false);response.reject(Error('offline'));await save
 assert.deepEqual(state.getSnapshot().ids,['prod_a']);assert.equal(state.getSnapshot().error,true);assert.deepEqual(state.getSnapshot().pending,[])
 const pending=deferred();const old=new WishlistState({list:()=>pending.promise,set:async()=>{}});const request=old.load();old.dispose();pending.resolve(['private']);await request
 assert.deepEqual(old.getSnapshot().ids,[])
})
test('failed initial load blocks unknown-state toggle and permits retry',async()=>{
 let fail=true,writes=0;const state=new WishlistState({list:async()=>{if(fail)throw Error('offline');return ['prod_a']},set:async()=>{writes++}})
 await state.load();await state.set('prod_a',false);assert.equal(writes,0);assert.equal(state.getSnapshot().ready,false)
 fail=false;await state.load();assert.equal(state.getSnapshot().ready,true);assert.equal(state.getSnapshot().error,false)
})
for(const locale of ['sr','en']) {
 const messages=JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url)))
 const t=key=>key.split('.').reduce((v,k)=>v[k],messages)
 const provider={ids:[],pending:[],ready:true,toggle:()=>{}}
 const {FavoriteButton,HeartIcon}=load('frontend/src/components/wishlist/FavoriteButton.tsx',{
  './WishlistProvider':{useWishlist:()=>provider},'@/components/i18n/LocaleProvider':{useTranslations:()=>t}
 })
 test(`component: ${locale} heart semantics and click isolation`,()=>{
  provider.ids=[];provider.pending=[];let stopped=0,prevented=0,toggled
  provider.toggle=(id,button)=>toggled={id,button}
  let button=FavoriteButton({productId:'prod_a',overlay:true})
  assert.equal(button.type,'button');assert.equal(button.props['aria-pressed'],false)
  assert.equal(button.props['aria-label'],locale==='sr'?'Dodaj u omiljene':'Add to wishlist');assert.equal(HeartIcon({}).props.className,'favorite-heart')
  const trigger={};button.props.onClick({currentTarget:trigger,stopPropagation:()=>stopped++,preventDefault:()=>prevented++})
  assert.equal(stopped,1);assert.equal(prevented,1);assert.deepEqual(toggled,{id:'prod_a',button:trigger})
  provider.ids=['prod_a'];provider.pending=['prod_a'];button=FavoriteButton({productId:'prod_a'})
  assert.equal(button.props['aria-pressed'],true);assert.equal(button.props.disabled,true)
  assert.equal(button.props['aria-label'],locale==='sr'?'Ukloni iz omiljenih':'Remove from wishlist');assert.equal(HeartIcon({filled:true}).props.className,'favorite-heart favorite-heart-filled')
 })
 test(`component: ${locale} header hides guest link and shows localized count`,()=>{
  let customer=null
  const {WishlistLink}=load('frontend/src/components/wishlist/WishlistLink.tsx',{
   './WishlistProvider':{useWishlist:()=>({ids:['a','b']})},'./FavoriteButton':{HeartIcon:'Heart'},
   '@/components/auth/AuthProvider':{useAuth:()=>({customer})},'@/components/i18n/LocaleProvider':{useTranslations:()=>t},'@/components/i18n/LocalizedLink':{default:'Link'}
  })
  assert.equal(WishlistLink(),null);customer={id:'customer'};const link=WishlistLink()
  assert.equal(link.props['aria-label'],locale==='sr'?'Omiljeno (2)':'Wishlist (2)')
  assert.equal(localizedPath(link.props.href,locale),locale==='sr'?'/rs/wishlist':'/en/wishlist')
  assert.equal(find(link,n=>n.props?.className==='wishlist-count').props.children,2)
  assert.equal(find(link,n=>n.type==='Heart').props.filled,true)
 })
}
test('component: guest action opens existing login and saves once after authenticated account loads',async()=>{
 const outer=hooks();let active=outer,customer=null;const requests=[]
 const react={...outer.react,useState:(...a)=>active.react.useState(...a),useRef:(...a)=>active.react.useRef(...a),useEffect:(...a)=>active.react.useEffect(...a),useMemo:(fn,deps)=>{const ref=active.react.useRef(null);if(!ref.current||deps.some((d,i)=>d!==ref.current.deps[i]))ref.current={deps,value:fn()};return ref.current.value},useSyncExternalStore:(_,snapshot)=>snapshot()}
 const {WishlistProvider}=load('frontend/src/components/wishlist/WishlistProvider.tsx',{
  react,'@/components/auth/AuthProvider':{useAuth:()=>({customer,isReady:true})},
  '@/components/auth/LoginDialog':{LoginDialog:'LoginDialog'},'@/components/i18n/LocaleProvider':{useTranslations:()=>k=>k},
  '@/lib/store/wishlist-state':{WishlistState},'@/lib/medusa':{sdk:{client:{fetch:async(path,options)=>{requests.push({path,options});return {product_ids:[]}}}}}
 },{window:{addEventListener(){},removeEventListener(){}}})
 const renderOuter=()=>{active=outer;return outer.render(()=>WishlistProvider({children:'content'}))}
 let tree=renderOuter();const guest=hooks();active=guest
 let context=guest.render(()=>tree.type(tree.props)).props.value
 context.toggle('prod_a',{});tree=renderOuter()
 assert.ok(find(tree,n=>n.type==='LoginDialog'));assert.equal(requests.length,0)
 customer={id:'cus_a'};tree=renderOuter();assert.equal(find(tree,n=>n.type==='LoginDialog'),null)
 const account=hooks();active=account;account.render(()=>tree.type(tree.props));await account.flush()
 active=account;account.render(()=>tree.type(tree.props));await account.flush()
 tree=renderOuter();active=account;account.render(()=>tree.type(tree.props));await account.flush()
 assert.equal(requests.filter(r=>r.options.method==='POST').length,1)
 assert.equal(requests.find(r=>r.options.method==='POST').options.body.product_id,'prod_a')
 context=account.render(()=>tree.type(tree.props)).props.value;assert.deepEqual(context.ids,['prod_a'])
})
for(const locale of ['sr','en']) test(`component: ${locale} wishlist empty, batch loading and unavailable removal`,async()=>{
 const messages=JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url)))
 const t=key=>key.split('.').reduce((v,k)=>v[k],messages),h=hooks();let ids=[];const batches=[]
 const {WishlistPage}=load('frontend/src/components/wishlist/WishlistPage.tsx',{
  react:h.react,'@/components/auth/AuthProvider':{useAuth:()=>({customer:{id:'cus_a'},isReady:true})},
  '@/components/auth/LoginDialog':{LoginDialog:'LoginDialog'},'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale,t})},
  '@/components/i18n/LocalizedLink':{default:'Link'},'@/components/store/ProductCard':{ProductCard:'ProductCard'},'./FavoriteButton':{FavoriteButton:'FavoriteButton'},
  './WishlistProvider':{useWishlist:()=>({ids,ready:true,error:false,retry(){}})},
  '@/lib/store/products':{listProductsByCountry:async options=>{batches.push(options);return {products:[{id:'prod_a',metadata:{en_content_ready:true,en_handle:'suit'},variants:[{id:'v_a',calculated_price:{calculated_amount:1500,currency_code:'rsd'}}]}]}}},
  '@/lib/store/commerce':{canPurchase:()=>true,variantAmount:price=>price?.calculated_amount},
 },{AbortController})
 const render=()=>h.render(()=>WishlistPage())
 let tree=render();assert.ok(JSON.stringify(tree).includes(locale==='sr'?'Još nemate omiljenih proizvoda.':'Your wishlist is empty.'))
 assert.equal(find(tree,n=>n.type==='Link').props.href,'/rs/catalog');await h.flush();assert.equal(batches.length,0)
 ids=['prod_a','prod_missing'];render();await h.flush();tree=render()
 assert.equal(batches.length,1);assert.deepEqual([...batches[0].ids],ids)
 const product=find(tree,n=>n.type==='ProductCard');assert.equal(product.props.product.catalog.price,1500);assert.equal(product.props.showAvailability,true)
 const missing=find(tree,n=>n.props?.className==='wishlist-unavailable');assert.ok(missing)
 assert.equal(find(missing,n=>n.type==='Link'),null);assert.equal(find(missing,n=>n.type==='FavoriteButton').props.productId,'prod_missing')
})
