import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shippingMethodName } from '../src/lib/checkout/shipping-method-name.ts'
import { createTranslator } from '../src/lib/i18n/translator.ts'

for (const locale of ['sr', 'en']) {
 const t=createTranslator(JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url),'utf8')))
 test(`unit: ${locale} shipping method names use storefront language in either direction`,()=>{
  for (const [aliases, sr, en] of [
   [['Standard Shipping','STANDARD   DELIVERY','Standard','Standardna dostava'],'Standardna dostava','Standard Shipping'],
   [['Express Shipping','Express Delivery','Express','Ekspresna dostava'],'Ekspresna dostava','Express Shipping'],
   [['Local pickup','Store pickup','Pickup','Lično preuzimanje'],'Lično preuzimanje','Local pickup'],
   [['Free shipping','Free delivery','Besplatna dostava'],'Besplatna dostava','Free shipping'],
   [['Delivery','Shipping',' Shipping','Dostava'],'Dostava','Delivery'],
  ]) for(const name of aliases) assert.equal(shippingMethodName(name,t),locale==='sr'?sr:en)
 })
 test(`unit: ${locale} preserves custom service names and handles unnamed methods`,()=>{
  for(const name of ['D Express — 24h','Standard Shipping — Belgrade','Post Express','constructor','__proto__']) assert.equal(shippingMethodName(name,t),name)
  for(const name of [undefined,null,'   ']) assert.equal(shippingMethodName(name,t),locale==='sr'?'Dostava':'Shipping')
 })
}
