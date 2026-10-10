import test from 'node:test'
import assert from 'node:assert/strict'
import { load, hooks, find } from '../test-support/component-harness.mjs'
const phone = load('frontend/src/lib/auth/registration-fields.ts')
const validation = load('frontend/src/lib/checkout/checkout-fields.ts', {'@/lib/auth/registration-fields':phone})
const account = load('frontend/src/lib/checkout/apply-customer.ts')
const valid={firstName:'Igor',lastName:'Test',email:'shopper@example.com',phone:'0641234567',country:'rs',city:'Novi Sad',postalCode:'21000',address1:'Test 1',notes:'',consent:true}
test('checkout validates contact details, required fields and consent',()=>{
 assert.equal(Object.keys(validation.checkoutErrors(valid)).length,0)
 for(const [key,value,error] of [['firstName',' ','required'],['email','bad@','email'],['phone','123','phone'],['postalCode','21x00','postalCode'],['city',' ','required'],['address1',' ','required'],['consent',false,'consent']])assert.equal(validation.checkoutErrors({...valid,[key]:value})[key],error)
 assert.equal(Object.keys(validation.checkoutErrors({...valid,phone:'+44 7700 900123'})).length,0)
})
function setup(customer=null){
 const h=hooks(),calls=[],focused=[]
 const cart={id:'cart_test',region_id:'rs',currency_code:'rsd',items:[{id:'line',quantity:1,unit_price:1500}],item_total:1500}
 const refresh=async()=>{}, t=k=>k
 const api={listPaymentProviders:async()=>[{id:'pp_system_default'}],setCartAddresses:async p=>calls.push(['address',p]),listShippingOptions:async()=>[{id:'ship',name:'Dostava',amount:300}],setShippingMethod:async()=>({cart:{...cart,total:1800,shipping_total:300}}),initiatePaymentSession:async()=>calls.push(['payment']),completeCart:async()=>{calls.push(['complete']);return {type:'order',order:{id:'order_test'}}}}
 const {CheckoutPageClient}=load('frontend/src/components/checkout/CheckoutPageClient.tsx',{
 react:h.react,'@/components/i18n/LocalizedLink':{default:'a'},'@/components/i18n/useLocalizedRouter':{useLocalizedRouter:()=>({push:url=>calls.push(['navigate',url])})},
 '@/components/auth/AuthProvider':{useAuth:()=>({customer,isReady:true,refresh})},'@/components/cart/CartProvider':{useCart:()=>({cart,isReady:true,isMutating:false})},
 '@/lib/checkout/apply-customer':account,'@/lib/checkout/checkout-client':api,'@/lib/format-money':{formatMoney:n=>String(n)},'@/lib/checkout/receipt':{saveReceipt:()=>{}},'@/lib/cart/cart-client':{clearCartId:()=>{}},'@/components/i18n/LocaleProvider':{useTranslations:()=>t},'@/lib/checkout/checkout-fields':validation,'@/lib/auth/registration-fields':phone,
 },{document:{getElementById:id=>({focus:()=>focused.push(id)})}})
 const render=()=>h.render(()=>CheckoutPageClient({countryCode:'rs'}))
 const field=id=>find(render(),n=>n.props?.id===`checkout-${id}`)
 const change=(id,value)=>field(id).props.onChange({target:{value,checked:value}})
 const submit=()=>find(render(),n=>n.type==='form').props.onSubmit({preventDefault(){}})
 return {h,calls,focused,render,field,change,submit}
}
for(const signedIn of [false,true])test(`${signedIn?'account':'guest'} checkout validates then quotes before completing`,async()=>{
 const customer=signedIn?{id:'customer',email:valid.email,first_name:valid.firstName,last_name:valid.lastName,phone:valid.phone,addresses:[{city:'Small village',postal_code:'21000',address_1:'Test 1',country_code:'rs'}]}:null
 const f=setup(customer);f.render();await f.h.flush();f.render()
 assert.equal(find(f.render(),n=>n.type==='form').props.noValidate,true)
 await f.submit();assert.equal(f.calls.length,0);assert.ok(f.focused.length)
 if(signedIn){assert.equal(f.field('city').props.value,'Small village');assert.equal(f.field('city').type,'input')}
 else for(const [key,value] of Object.entries(valid))if(key!=='consent')f.change(key,value)
 f.change('consent',true)
 await f.submit();assert.equal(f.calls.filter(c=>c[0]==='complete').length,0)
 assert.equal(f.calls.find(c=>c[0]==='address')[1].shipping_address.phone,'+381641234567')
 await f.submit();assert.equal(f.calls.filter(c=>c[0]==='complete').length,1)
})
test('custom account details and changes to reviewed address require validation and a fresh quote',async()=>{
 const f=setup({id:'customer',email:valid.email});f.render();await f.h.flush();f.render()
 find(f.render(),n=>n.type==='input'&&n.props.name==='addressSource'&&!n.props.checked).props.onChange();f.render();await f.h.flush()
 for(const [key,value] of Object.entries(valid))f.change(key,value)
 await f.submit();f.change('address1','Different 2');await f.submit()
 assert.equal(f.calls.filter(c=>c[0]==='complete').length,0)
 f.change('email','invalid');await f.submit();assert.equal(f.field('email').props['aria-invalid'],true)
})
