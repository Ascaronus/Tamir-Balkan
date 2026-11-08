import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {load,find,hooks} from '../test-support/component-harness.mjs'
import {createTranslator} from '../src/lib/i18n/translator.ts'
for(const locale of ['sr','en'])test(`${locale} cart removal keeps its label and removes the correct line with a decorative trash icon`,async()=>{
 const messages=JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url)))
 const t=createTranslator(messages),removed=[],h=hooks()
 const {CartPageClient}=load('frontend/src/components/cart/CartPageClient.tsx',{
 react:h.react,'@/lib/cart/useVariantStock':{useVariantStock:()=>({})},
 '@/components/i18n/LocalizedLink':{default:'a'},'@/components/auth/AuthProvider':{useAuth:()=>({customer:null})},
 './CartProvider':{useCart:()=>({isReady:true,isMutating:false,cart:{currency_code:'rsd',items:[{id:'line_a',title:'Kapa',quantity:1,unit_price:100}]},removeItem:async id=>removed.push(id)})},
 '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({t,locale})},
 '@/lib/cart/display':load('frontend/src/lib/cart/display.ts'),
 '@/lib/format-money':{formatMoney:String},'@/components/store/ProductImage':{ProductImage:'img'},'@/lib/product-image':{normalizeImageUrl:()=>undefined},
 })
 const button=find(h.render(()=>CartPageClient()),n=>n.type==='button'&&n.props.className?.includes('cart-remove'))
 assert.equal(find(button,n=>n.type==='span').props.children,messages.cartPage.remove)
 const icon=find(button,n=>n.type==='svg');assert.equal(icon.props['aria-hidden'],'true');assert.equal(icon.props.focusable,'false')
 button.props.onClick();await Promise.resolve();assert.deepEqual(removed,['line_a'])
 assert.ok(messages.checkout.emailOptional.includes(locale==='sr'?'opciono':'optional'))
})

for(const locale of ['sr','en'])test(`${locale} cart shows exact stock only after a rejected quantity change`,()=>{
 const messages=JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url)))
 const t=createTranslator(messages),h=hooks()
 const state={isReady:true,isMutating:false,error:null,stockError:null,cart:{currency_code:'rsd',items:[{id:'line_a',variant_id:'v1',title:'Kapa',quantity:2,unit_price:100}]}}
 const {CartPageClient}=load('frontend/src/components/cart/CartPageClient.tsx',{
 react:h.react,'@/lib/cart/useVariantStock':{useVariantStock:()=>({})},
 '@/components/i18n/LocalizedLink':{default:'a'},'@/components/auth/AuthProvider':{useAuth:()=>({customer:null})},
 './CartProvider':{useCart:()=>state},'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({t,locale})},
 '@/lib/cart/display':load('frontend/src/lib/cart/display.ts'),'@/lib/format-money':{formatMoney:String},
 '@/components/store/ProductImage':{ProductImage:'img'},'@/lib/product-image':{normalizeImageUrl:()=>undefined},
 })
 assert.equal(find(h.render(()=>CartPageClient()),n=>n.props?.role==='alert'),null)
 state.error='CART_STOCK_LIMIT';state.stockError={variantId:'v1',available:1,inCart:2}
 const alert=find(h.render(()=>CartPageClient()),n=>n.props?.role==='alert')
 assert.ok(JSON.stringify(alert).includes(t('cartPage.stockLimit',{n:1})))
 assert.ok(JSON.stringify(alert).includes('Kapa'))
 assert.ok(!JSON.stringify(alert).includes('CART_STOCK_LIMIT'))
})

for(const locale of ['sr','en'])test(`${locale}: cart quantity controls use available stock before mutation`,async()=>{
 const h=hooks(),t=createTranslator(JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url)))),calls=[]
 const stock={v1:1},state={isReady:true,isMutating:false,error:null,cart:{id:'cart',currency_code:'rsd',items:[{id:'line_a',variant_id:'v1',title:'Kapa',quantity:1}]},updateItemQuantity:async(...args)=>calls.push(args)}
 const {CartPageClient}=load('frontend/src/components/cart/CartPageClient.tsx',{
 react:h.react,'@/lib/cart/useVariantStock':{useVariantStock:()=>stock},
 '@/components/i18n/LocalizedLink':{default:'a'},'@/components/auth/AuthProvider':{useAuth:()=>({customer:null})},
 './CartProvider':{useCart:()=>state},'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({t,locale})},
 '@/lib/cart/display':load('frontend/src/lib/cart/display.ts'),'@/lib/format-money':{formatMoney:String},
 '@/components/store/ProductImage':{ProductImage:'img'},'@/lib/product-image':{normalizeImageUrl:()=>undefined},
 })
 const render=()=>h.render(()=>CartPageClient()),control=key=>find(render(),n=>n.props?.['aria-label']===t('cartPage.'+key))
 assert.equal(control('increaseQty').props.disabled,true);assert.equal(control('decreaseQty').props.disabled,true)
 assert.equal(find(render(),n=>n.props?.role==='alert'),null)
 stock.v1=3;assert.equal(control('increaseQty').props.disabled,false)
 control('increaseQty').props.onClick();assert.deepEqual(calls,[['line_a',2]])
 state.cart.items[0].quantity=3;control('increaseQty').props.onClick()
 assert.equal(calls.length,1);assert.ok(JSON.stringify(find(render(),n=>n.props?.role==='alert')).includes(t('cartPage.stockLimit',{n:3})))
 // A reservation can reduce stock after the cart already contains too many units.
 stock.v1=1;assert.equal(control('increaseQty').props.disabled,true);assert.equal(control('decreaseQty').props.disabled,false)
 assert.ok(JSON.stringify(find(render(),n=>n.props?.role==='alert')).includes(t('cartPage.stockLimit',{n:1})))
 control('decreaseQty').props.onClick();assert.deepEqual(calls.at(-1),['line_a',2])
 assert.equal(find(render(),n=>n.props?.role==='alert'),null)
 state.cart.items[0].quantity=1;stock.v1=3;state.cart.items.push({id:'line_b',variant_id:'v1',quantity:2})
 assert.equal(control('increaseQty').props.disabled,true)
 stock.v1=null;assert.equal(control('increaseQty').props.disabled,false)
 delete stock.v1;assert.equal(control('increaseQty').props.disabled,false)
})
