import test from 'node:test'
import assert from 'node:assert/strict'
import {load,hooks,find} from '../test-support/component-harness.mjs'
const t=k=>k

test('profile saves reuse created address and send explicit note deletion',async()=>{
 const h=hooks();let creates=0,saved
 let customer={id:'c',first_name:'A',last_name:'B',phone:'123',email:'a@example.test',addresses:[]}
 const form=load('frontend/src/components/auth/AccountProfileForm.tsx',{
  react:h.react,'@/components/auth/AuthProvider':{useAuth:()=>({customer,refresh:async()=>{customer={...customer}}})},
  '@/components/i18n/LocaleProvider':{useTranslations:()=>t},
  '@/lib/checkout/apply-customer':load('frontend/src/lib/checkout/apply-customer.ts'),
  '@/lib/auth/auth-client':{retrieveCustomer:async()=>customer,updateCustomerProfile:async p=>{saved=p},upsertCustomerShippingAddress:async p=>{if(!p.addressId)creates++;customer={...customer,addresses:[{...p,id:'addr',is_default_shipping:true}]};return customer}}
 })
 const render=()=>h.render(()=>form.AccountProfileForm({countryCode:'rs'}))
 render();await h.flush();let tree=render()
 const postal=find(tree,n=>n.type==='label'&&JSON.stringify(n.props.children).includes('auth.register.postalCode'))
 find(postal,n=>n.type==='input').props.onChange({target:{value:'21000'}})
 for(let i=0;i<2;i++){tree=render();await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});render();await h.flush()}
 assert.equal(creates,1);assert.equal(saved.metadata.notes,null)
})
test('phone login ignores attacker-controlled Host and rejects redirect forwarding',async()=>{
 let sent
 const route=load('backend/src/api/store/auth/phone-login/route.ts',{}, {process:{env:{}},fetch:async(url,init)=>{sent={url,...init};return {ok:false}}})
 await route.POST({body:{phone:'+381123',password:'dummy'},protocol:'https',get:()=> 'attacker.invalid',scope:{resolve:()=>({graph:async()=>({data:[{email:'dummy@example.test'}]})})}},{status(){return this},json(){}})
 assert.equal(sent.url,'http://127.0.0.1:9000/auth/customer/emailpass');assert.equal(sent.redirect,'error')
})
test('missing customer profile fails login explicitly',async()=>{
 const h=hooks()
 const auth=load('frontend/src/components/auth/AuthProvider.tsx',{react:h.react,'@/lib/auth/auth-storage':{getAuthToken:()=>null},'@/lib/auth/auth-client':{login:async()=> 'token',retrieveCustomer:async()=>null}})
 const provider=h.render(()=>auth.AuthProvider({children:null}))
 await assert.rejects(provider.props.value.login('a','b'),/CUSTOMER_PROFILE_MISSING/)
})
test('payment method request can be retried after failure',async()=>{
 const h=hooks();let requests=0
 const c=load('frontend/src/components/checkout/CheckoutPageClient.tsx',{
  react:h.react,'next/navigation':{useRouter:()=>({push(){}})},
  '@/components/auth/AuthProvider':{useAuth:()=>({customer:null,isReady:false,refresh:()=>{}})},
  '@/components/cart/CartProvider':{useCart:()=>({cart:{id:'cart',region_id:'region',items:[{id:'i',quantity:1}]},isReady:true,isMutating:false})},
  '@/lib/checkout/apply-customer':{},'@/lib/checkout/receipt':{},'@/lib/format-money':{},'@/lib/cart/cart-client':{},
  '@/components/i18n/LocaleProvider':{useTranslations:()=>t},
  '@/lib/checkout/checkout-client':{listPaymentProviders:async()=>{if(++requests===1)throw Error('offline');return [{id:'pp_system_default'}]},setCartAddresses:async()=>{},listShippingOptions:async()=>[{id:'shipping'}]}
 })
 const render=()=>h.render(()=>c.CheckoutPageClient({countryCode:'rs'}))
 render();await h.flush();let tree=render()
 await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=render()
 assert.equal(find(tree,n=>n.type==='button'&&n.props.type==='submit').props.disabled,true)
 find(tree,n=>n.type==='button'&&n.props.children==='checkout.retryPayment').props.onClick()
 render();await h.flush();tree=render()
 assert.equal(requests,2);assert.equal(find(tree,n=>n.type==='button'&&n.props.type==='submit').props.disabled,false)
})
test('unknown guest order never displays confirmed',async()=>{
 const h=hooks();let requested=false
 const c=load('frontend/src/components/checkout/OrderConfirmation.tsx',{react:h.react,'@/lib/medusa':{sdk:{client:{fetch:async()=>{requested=true}}}},'@/lib/auth/auth-storage':{getAuthToken:()=>null},'@/lib/checkout/receipt':{readReceipt:()=>null},'@/components/i18n/LocaleProvider':{useTranslations:()=>t}})
 const render=()=>h.render(()=>c.OrderConfirmation({id:'does-not-exist'}))
 render();await h.flush();const tree=render()
 assert.ok(JSON.stringify(tree).includes('order.unverified'));assert.equal(requested,false)
})
test('variant URL changes remount selection with the requested variant',()=>{
 const h=hooks();let id='m'
 const details=load('frontend/src/components/product/ProductDetails.tsx',{
 react:h.react,'next/navigation':{useSearchParams:()=>({get:()=>id})},'next/link':{},
 '@/components/cart/CartProvider':{},'@/components/i18n/LocaleProvider':{},'@/components/store/ProductImage':{},'@/lib/product-image':{},'@/lib/format-money':{},'@/lib/store/commerce':{},'@/lib/i18n/content':{}
 })
 const props={product:{id:'p'},initialVariantId:'m'}
 const first=details.ProductDetails(props);id='l';const next=details.ProductDetails(props)
 assert.notEqual(first.key,next.key);assert.equal(next.props.initialVariantId,'l')
})
