import * as shippingNames from '../src/lib/checkout/shipping-method-name.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load } from '../test-support/component-harness.mjs'
import { createTranslator } from '../src/lib/i18n/translator.ts'
import { formatMoney } from '../src/lib/format-money.ts'
const option=(amount,name='Standard')=>({id:name,name,amount,currency_code:'rsd'})
for(const locale of ['sr','en']){
 const t=createTranslator(JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url),'utf8')))
 const {ProductDelivery}=load('frontend/src/components/product/ProductDelivery.tsx',{'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale,t})},'@/lib/checkout/shipping-method-name':shippingNames,'@/lib/format-money':{formatMoney}})
 const render=delivery=>JSON.stringify(ProductDelivery({delivery}))
 test(`component: ${locale} delivery uses configured amount and translates zero as free`,()=>{
  const free=render({options:[option(0)],requires_checkout:false});assert.ok(free.includes(locale==='sr'?'Besplatno':'Free'));assert.ok(!free.includes('300'))
  for(const amount of [450,299.5])assert.ok(render({options:[option(amount)],requires_checkout:false}).includes(formatMoney(amount,'rsd',locale==='en'?'en-GB':'sr-Latn-RS')))
 })
 test(`component: ${locale} distinct delivery prices are named; unavailable estimates are not free`,()=>{
  const multiple=render({options:[option(0),option(500,'Express')],requires_checkout:false});assert.ok(multiple.includes(locale==='sr'?'Standardna dostava':'Standard Shipping'));assert.ok(multiple.includes(locale==='sr'?'Ekspresna dostava':'Express Shipping'));assert.ok(multiple.includes('500'))
  for(const delivery of [null,{options:[],requires_checkout:true}]){
   const result=render(delivery);assert.ok(result.includes(t('product.deliveryAtCheckout')));assert.ok(!result.includes(t('product.deliveryFree')))
  }
 })
}
test('unit: product delivery requests live configuration without a cart and degrades safely on failure',async()=>{
 let request
 const {getProductDelivery}=load('frontend/src/lib/store/product-delivery.ts',{'@/lib/medusa':{sdk:{client:{fetch:async(url,options)=>{request={url,options};return {options:[option(0)],requires_checkout:false}}}}}})
 assert.equal((await getProductDelivery('prod_a')).options[0].amount,0);assert.equal(request.options.cache,'no-store');assert.equal(request.options.query.product_id,'prod_a');assert.equal(request.url,'/store/product-delivery')
 const failed=load('frontend/src/lib/store/product-delivery.ts',{'@/lib/medusa':{sdk:{client:{fetch:async()=>{throw Error('offline')}}}}})
 assert.equal(await failed.getProductDelivery('prod_a'),null)
})
