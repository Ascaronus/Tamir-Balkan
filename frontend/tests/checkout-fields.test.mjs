import { readFileSync } from 'node:fs'
import { createTranslator } from '../src/lib/i18n/translator.ts'
import * as shippingNames from '../src/lib/checkout/shipping-method-name.ts'
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
function setup(customer=null, translations=null, options=[{id:'ship',name:'Dostava',amount:300}]){
 const h=hooks(),calls=[],focused=[]
 const cart={id:'cart_test',region_id:'rs',currency_code:'rsd',items:[{id:'line',quantity:1,unit_price:1500}],item_total:1500}
 const refresh=async()=>{}, t=translations || (k=>k)
 const api={listPaymentProviders:async()=>[{id:'pp_system_default'}],setCartAddresses:async p=>calls.push(['address',p]),listShippingOptions:async()=>options,setShippingMethod:async params=>{calls.push(['shipping',params]);return {cart:{...cart,total:1800,shipping_total:300}}},initiatePaymentSession:async()=>calls.push(['payment']),completeCart:async()=>{calls.push(['complete']);return {type:'order',order:{id:'order_test'}}}}
 const {CheckoutPageClient}=load('frontend/src/components/checkout/CheckoutPageClient.tsx',{
 react:h.react,'@/components/i18n/LocalizedLink':{default:'a'},'@/components/i18n/useLocalizedRouter':{useLocalizedRouter:()=>({push:url=>calls.push(['navigate',url])})},
 '@/components/auth/AuthProvider':{useAuth:()=>({customer,isReady:true,refresh})},'@/components/cart/CartProvider':{useCart:()=>({cart,isReady:true,isMutating:false})},
 '@/lib/checkout/apply-customer':account,'@/lib/checkout/checkout-client':api,'@/lib/checkout/shipping-method-name':shippingNames,'@/lib/format-money':{formatMoney:n=>String(n)},'@/lib/checkout/receipt':{saveReceipt:()=>{}},'@/lib/cart/cart-client':{clearCartId:()=>{}},'@/components/i18n/LocaleProvider':{useTranslations:()=>t},'@/lib/checkout/checkout-fields':validation,'@/lib/auth/registration-fields':phone,
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
 f.change('consent',false)
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

test('checkout policy starts checked and unchecking it blocks submission',async()=>{
 const f=setup();f.render();await f.h.flush()
 assert.equal(f.field('consent').props.checked,true)
 for(const [key,value] of Object.entries(valid))if(key!=='consent')f.change(key,value)
 f.change('consent',false);await f.submit()
 assert.equal(f.field('consent').props.checked,false)
 assert.equal(f.field('consent').props['aria-invalid'],true)
 assert.equal(f.calls.length,0)
 f.change('consent',true);await f.submit()
 assert.ok(f.calls.some(c=>c[0]==='address'))
})

test('guest can quote and complete without email; phone remains required and provided email is validated',async()=>{
 const f=setup();f.render();await f.h.flush()
 for(const [key,value] of Object.entries(valid))if(key!=='email')f.change(key,value)
 assert.equal(f.field('email').props.required,false)
 assert.equal(f.field('phone').props.required,true)
 f.change('phone','');await f.submit();assert.equal(f.calls.length,0);assert.equal(f.field('phone').props['aria-invalid'],true)
 f.change('phone',valid.phone);f.change('email','bad@');await f.submit();assert.equal(f.calls.length,0);assert.equal(f.field('email').props['aria-invalid'],true)
 f.change('email','');await f.submit();assert.equal(f.calls.find(c=>c[0]==='address')[1].email,'')
 await f.submit();assert.equal(f.calls.filter(c=>c[0]==='complete').length,1)
})
test('account checkout still requires email',async()=>{
 const f=setup({id:'customer',email:valid.email});f.render();await f.h.flush()
 for(const [key,value] of Object.entries(valid))f.change(key,value)
 f.change('email','');await f.submit()
 assert.equal(f.field('email').props.required,true);assert.equal(f.field('email').props['aria-invalid'],true);assert.equal(f.calls.length,0)
})
test('checkout client omits empty email and sends explicit guest clearing flag, never an empty or fake email',async()=>{
 const calls=[]
 const client=load('frontend/src/lib/checkout/checkout-client.ts',{'@/lib/medusa':{sdk:{client:{fetch:async(url,options)=>calls.push([url,options.body])}}}})
 const address={phone:'+381641234567',country_code:'rs'}
 await client.setCartAddresses({cartId:'cart_test',email:'   ',shipping_address:address})
 assert.equal(calls[0][1].email,undefined);assert.equal(calls[0][1].additional_data.tamir_clear_guest_email,true)
 assert.equal(calls[0][1].shipping_address.phone,address.phone)
 await client.setCartAddresses({cartId:'cart_test',email:' shopper@example.com ',shipping_address:address})
 assert.equal(calls[1][1].email,'shopper@example.com');assert.equal(calls[1][1].additional_data.tamir_clear_guest_email,false)
})

for(const locale of ['sr','en'])test(`component: ${locale} shipping choices and selected summary are translated without changing method IDs`,async()=>{
 const t=createTranslator(JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url),'utf8')))
 const f=setup(null,t,[{id:'ship_standard',name:'Standard Shipping',amount:0},{id:'ship_express',name:'Express Shipping',amount:450},{id:'ship_live',name:' Shipping',amount:0}])
 f.render();await f.h.flush()
 for(const [key,value] of Object.entries(valid))f.change(key,value)
 await f.submit()
 const standard=locale==='sr'?'Standardna dostava':'Standard Shipping',express=locale==='sr'?'Ekspresna dostava':'Express Shipping'
 const choice=(id)=>find(f.render(),n=>n.type==='label'&&find(n,c=>c.type==='input'&&c.props.name==='shipping'&&c.props.value===id))
 const summary=()=>find(f.render(),n=>n.type==='p'&&typeof n.props.children==='string'&&n.props.children.startsWith(t('checkout.shipping')+': ')).props.children
 assert.equal(find(choice('ship_standard'),n=>n.type==='span').props.children.join(''),standard+' — 0')
 assert.equal(find(choice('ship_express'),n=>n.type==='span').props.children.join(''),express+' — 450')
 assert.equal(summary(),t('checkout.shipping')+': '+standard)
 await find(choice('ship_express'),n=>n.type==='input').props.onChange()
 assert.equal(summary(),t('checkout.shipping')+': '+express)
 assert.equal(find(choice('ship_express'),n=>n.type==='input').props.checked,true)
 assert.equal(f.calls.filter(c=>c[0]==='shipping').at(-1)[1].optionId,'ship_express')
 await find(choice('ship_live'),n=>n.type==='input').props.onChange()
 assert.equal(summary(),t('checkout.shipping')+': '+(locale==='sr'?'Dostava':'Delivery'))
 assert.equal(f.calls.filter(c=>c[0]==='shipping').at(-1)[1].optionId,'ship_live')
 if(locale==='sr')assert.ok(!JSON.stringify(f.render()).includes('Express Shipping'))
})
