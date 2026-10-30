import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {load,find} from '../test-support/component-harness.mjs'
import {createTranslator} from '../src/lib/i18n/translator.ts'
for(const locale of ['sr','en'])test(`${locale} cart removal keeps its label and removes the correct line with a decorative trash icon`,async()=>{
 const messages=JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url)))
 const t=createTranslator(messages),removed=[]
 const {CartPageClient}=load('frontend/src/components/cart/CartPageClient.tsx',{
 '@/components/i18n/LocalizedLink':{default:'a'},'@/components/auth/AuthProvider':{useAuth:()=>({customer:null})},
 './CartProvider':{useCart:()=>({isReady:true,isMutating:false,cart:{currency_code:'rsd',items:[{id:'line_a',title:'Kapa',quantity:1,unit_price:100}]},removeItem:async id=>removed.push(id)})},
 '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({t,locale})},
 '@/lib/cart/display':load('frontend/src/lib/cart/display.ts'),
 '@/lib/format-money':{formatMoney:String},'@/components/store/ProductImage':{ProductImage:'img'},'@/lib/product-image':{normalizeImageUrl:()=>undefined},
 })
 const button=find(CartPageClient(),n=>n.type==='button'&&n.props.className?.includes('cart-remove'))
 assert.equal(find(button,n=>n.type==='span').props.children,messages.cartPage.remove)
 const icon=find(button,n=>n.type==='svg');assert.equal(icon.props['aria-hidden'],'true');assert.equal(icon.props.focusable,'false')
 button.props.onClick();await Promise.resolve();assert.deepEqual(removed,['line_a'])
 assert.ok(messages.checkout.emailOptional.includes(locale==='sr'?'opciono':'optional'))
})
