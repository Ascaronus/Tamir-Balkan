import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {load,hooks,find} from '../test-support/component-harness.mjs'
import {createTranslator} from '../src/lib/i18n/translator.ts'

function fixture(locale, options={}) {
 const {quantity=3,other=0,fail=false}=options
 const available=Object.hasOwn(options,'available')?options.available:1
 const h=hooks(),t=createTranslator(JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url))))
 const requests=[],removed=[]
 let saved={id:'cart_saved',region_id:'reg_rs',items:[{id:'line_a',variant_id:'v1',title:'Hat',quantity},...(other?[{id:'line_b',variant_id:'v1',title:'Hat',quantity:other}]:[])]}
 const state={cart:saved,isReady:true,isMutating:false,error:null,stockError:null}
 // Real cart-client crosses a fake SDK boundary with Medusa's resulting-stock rule.
 const client=load('frontend/src/lib/cart/cart-client.ts',{
  '@/lib/store/commerce':{requireQuantity:n=>assert.ok(Number.isInteger(n)&&n>0)},
  '@/lib/store/regions':{getRegionByCountry:async()=>({id:'reg_rs'})},
  './cart-storage':{getStoredCartId:()=>null},
  '@/lib/medusa':{sdk:{client:{fetch:async path=>path==='/store/customer-cart'?{cart_id:saved.id,claimed_guest:false}:{cart:saved}},store:{cart:{updateLineItem:async(id,line,body)=>{
   requests.push({id,line,quantity:body.quantity})
   if(fail)throw Object.assign(Error('offline'),{status:503})
   if(typeof available==='number'&&body.quantity+other>available)throw Object.assign(Error('Insufficient inventory'),{status:400})
   saved={...saved,items:saved.items.map(item=>item.id===line?{...item,quantity:body.quantity}:item)}
   return {cart:saved}
  }}}}},
 })
 state.updateItemQuantity=async(lineItemId,quantity)=>{
  try {state.cart=await client.updateLineItem({countryCode:'rs',customerId:'cus_a',lineItemId,quantity});state.error=null}
  catch(error){state.error=error.message;throw error}
 }
 state.removeItem=async id=>removed.push(id)
 const {CartPageClient}=load('frontend/src/components/cart/CartPageClient.tsx',{
  react:h.react,'@/lib/cart/useVariantStock':{useVariantStock:()=>available===undefined?{}:{v1:available}},
  '@/components/i18n/LocalizedLink':{default:'a'},'@/components/auth/AuthProvider':{useAuth:()=>({customer:{id:'cus_a'}})},
  './CartProvider':{useCart:()=>state},'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({t,locale})},
  '@/lib/cart/display':load('frontend/src/lib/cart/display.ts'),'@/lib/format-money':{formatMoney:String},
  '@/components/store/ProductImage':{ProductImage:'img'},'@/lib/product-image':{normalizeImageUrl:()=>undefined},
 })
 const render=()=>h.render(CartPageClient)
 return {render,state,requests,removed,t,button:key=>find(render(),n=>n.props?.['aria-label']===t('cartPage.'+key))}
}
for(const locale of ['sr','en']) {
 for(const [quantity,available,other,expected] of [[3,1,0,1],[5,2,0,2],[3,3,0,2],[5,3,1,2],[3,null,0,2],[3,undefined,0,2]]) {
  test(`${locale}: minus from ${quantity}, stock ${available}, other lines ${other} sends valid quantity ${expected}`,async()=>{
   const f=fixture(locale,{quantity,available,other})
   assert.equal(f.button('decreaseQty').props.disabled,false)
   assert.equal(f.state.cart.items[0].quantity,quantity)
   f.button('decreaseQty').props.onClick();await new Promise(r=>setImmediate(r))
   assert.deepEqual(f.requests,[{id:'cart_saved',line:'line_a',quantity:expected}])
   assert.equal(f.state.cart.items[0].quantity,expected);assert.equal(f.state.error,null)
   assert.equal(find(f.render(),n=>n.props?.role==='alert'),null)
   assert.deepEqual(f.removed,[])
   if(expected===1){assert.equal(f.button('decreaseQty').props.disabled,true);assert.equal(f.button('increaseQty').props.disabled,true)}
  })
 }
 test(`${locale}: zero or fully allocated stock offers explicit removal without invalid decreases`,async()=>{
  for(const options of [{available:0},{available:1,other:1}]){
   const f=fixture(locale,options)
   assert.equal(f.button('decreaseQty').props.disabled,true)
   // Guard also protects a stale/programmatic click; never submit zero or delete implicitly.
   f.button('decreaseQty').props.onClick();await new Promise(r=>setImmediate(r))
   assert.deepEqual(f.requests,[]);assert.deepEqual(f.removed,[]);assert.equal(f.state.cart.items[0].quantity,3)
   const remove=find(f.render(),n=>n.type==='button'&&n.props.className?.includes('cart-remove'))
   assert.equal(remove.props.disabled,false);remove.props.onClick();await Promise.resolve();assert.deepEqual(f.removed,['line_a'])
  }
 })
 test(`${locale}: failed decrease retains original quantity and reports the failure`,async()=>{
  const f=fixture(locale,{fail:true});f.button('decreaseQty').props.onClick();await new Promise(r=>setImmediate(r))
  assert.equal(f.requests[0].quantity,1);assert.equal(f.state.cart.items[0].quantity,3)
  assert.ok(JSON.stringify(find(f.render(),n=>n.props?.role==='alert')).includes(f.t('cartPage.updateFailed')))
 })
}
