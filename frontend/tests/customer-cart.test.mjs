import test from 'node:test'
import assert from 'node:assert/strict'
import {load,hooks} from '../test-support/component-harness.mjs'

function clientFixture(){
 let stored='cart_guest',owner='a',claim=false,fail=false
 const calls=[],writes=[],carts={cart_a:{id:'cart_a',items:[{quantity:4}]},cart_b:{id:'cart_b',items:[{quantity:1}]},cart_guest:{id:'cart_guest',items:[{quantity:2}]}}
 const api=load('frontend/src/lib/cart/cart-client.ts',{
  '@/lib/store/commerce':{requireQuantity:()=>{}},'@/lib/store/regions':{getRegionByCountry:async()=>({id:'reg_rs'})},
  './cart-storage':{getStoredCartId:()=>stored,setStoredCartId:id=>{stored=id;writes.push(id)},clearStoredCartId:()=>{stored=null;writes.push(null)}},
  '@/lib/medusa':{sdk:{store:{cart:{create:async()=>{throw Error('must not create a replacement after failure')}}},client:{fetch:async(path,options)=>{
   calls.push({path,options})
   if(fail)throw Error('offline')
   if(path==='/store/customer-cart')return {cart_id:claim?'cart_guest':'cart_'+owner,claimed_guest:claim}
   return {cart:carts[path.split('/').at(-1)]}
  }}}},
 },{window:{dispatchEvent(){}},Event})
 return {api,calls,writes,stored:()=>stored,setOwner:value=>owner=value,setClaim:value=>claim=value,setFail:value=>fail=value}
}
test('account login/logout/relogin restores saved lines without storing a private cart ID',async()=>{
 const f=clientFixture()
 assert.equal((await f.api.getOrCreateCart('rs','a')).id,'cart_a')
 assert.equal((await f.api.getOrCreateCart('rs')).id,'cart_guest')
 f.setOwner('b');assert.equal((await f.api.getOrCreateCart('rs','b')).id,'cart_b')
 f.setOwner('a');assert.equal((await f.api.getOrCreateCart('rs','a')).items[0].quantity,4)
 assert.equal(f.stored(),'cart_guest');assert.deepEqual(f.writes,[])
 assert.ok(f.calls.filter(c=>c.path==='/store/customer-cart').every(c=>!('customer_id' in c.options.body)))
 await f.api.clearCartId('a');assert.equal(f.stored(),'cart_guest')
})
test('only a successfully claimed guest pointer is cleared; failed restore never creates an empty replacement',async()=>{
 const f=clientFixture();f.setFail(true)
 await assert.rejects(f.api.getOrCreateCart('rs','a'),/offline/);assert.equal(f.stored(),'cart_guest')
 f.setFail(false);f.setClaim(true)
 assert.equal((await f.api.getOrCreateCart('rs','a')).id,'cart_guest')
 assert.equal(f.stored(),null)
})

test('provider hides an account immediately during logout and discards late responses after account changes',async()=>{
 const h=hooks(),requests=[],listeners=new Map()
 let auth={customer:{id:'a'},isReady:true,isMutating:false}
 const react={...h.react,
  useCallback(fn,deps){const ref=h.react.useRef();if(!ref.current||deps.some((d,i)=>d!==ref.current.deps[i]))ref.current={fn,deps};return ref.current.fn},
  useEffect(fn,deps){const ref=h.react.useRef();h.react.useEffect(()=>{ref.current?.();ref.current=fn()},deps)},
 }
 const {CartProvider}=load('frontend/src/components/cart/CartProvider.tsx',{
  react,'next/navigation':{usePathname:()=>'/rs'},'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'sr'})},
  '@/components/auth/AuthProvider':{useAuth:()=>auth},'@/lib/store/commerce':{stableItems:items=>items},'./AddedToCartDialog':{},
  './useLocalizedCart':{useLocalizedCartState:cart=>({cart,ready:true,error:false,retry(){}})},
  '@/lib/cart/cart-client':{getOrCreateCart:(_country,owner)=>new Promise(resolve=>requests.push({owner,resolve}))},
 },{window:{addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n)}})
 const render=()=>h.render(()=>CartProvider({countryCode:'rs',children:null})).props.value
 render();await h.flush();assert.equal(requests[0].owner,'a')
 requests[0].resolve({id:'cart_a',items:[{quantity:4}]});await h.flush();assert.equal(render().itemCount,4)
 auth={...auth,isMutating:true};assert.equal(render().cart,null);assert.equal(render().itemCount,0);await h.flush()
 auth={customer:null,isReady:true,isMutating:false};render();await h.flush();assert.equal(requests[1].owner,null)
 // Log in to another account while the guest request is still pending.
 auth={...auth,customer:{id:'b'}};assert.equal(render().cart,null);await h.flush()
 requests[1].resolve({id:'cart_guest',items:[{quantity:99}]});await h.flush();assert.equal(render().cart,null)
 assert.equal(requests[2].owner,'b');requests[2].resolve({id:'cart_b',items:[{quantity:1}]});await h.flush()
 assert.equal(render().cart.id,'cart_b');assert.equal(render().itemCount,1)
 auth={...auth,customer:{id:'a'}};assert.equal(render().cart,null);await h.flush()
 requests[3].resolve({id:'cart_a',items:[{quantity:4}]});await h.flush();assert.equal(render().itemCount,4)
})
