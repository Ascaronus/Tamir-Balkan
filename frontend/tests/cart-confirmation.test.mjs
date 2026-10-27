import * as dialogBackdrop from '../src/lib/dialog-backdrop.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {load,hooks,find} from '../test-support/component-harness.mjs'
const cartDisplay=load('frontend/src/lib/cart/display.ts')
const cart={id:'c',currency_code:'rsd',items:[{id:'line',variant_id:'v',quantity:3,unit_price:100,total:270,product_title:'Hat'}],item_total:270}
function provider(addToCart){
 const h=hooks();let path='/rs/products/hat';
 class Element {}
 const trigger=new Element()
 const {CartProvider}=load('frontend/src/components/cart/CartProvider.tsx',{
 react:h.react,'next/navigation':{usePathname:()=>path},
 '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'sr'})},
 '@/components/auth/AuthProvider':{useAuth:()=>({isReady:false})},
 '@/lib/cart/cart-client':{addToCart},'@/lib/store/commerce':{stableItems:items=>items},
 './useLocalizedCart':{useLocalizedCartState:cart=>({cart,ready:true,error:false,retry(){}})},'./AddedToCartDialog':{AddedToCartDialog:'Confirmation'}
 },{document:{activeElement:trigger},HTMLElement:Element,Error})
 const render=()=>h.render(()=>CartProvider({countryCode:'rs',children:'content'}))
 return {render,trigger,navigate:()=>{path='/rs/cart'}}
}
test('confirmation appears only after successful mutation and records added quantity, not merged quantity',async()=>{
 let resolve;const p=provider(()=>new Promise(r=>resolve=r));let tree=p.render();
 const display={title:'Kapa',options:[{label:'Boja',value:'Siva'}]}
 const pending=tree.props.value.addItem('v',2,display);await Promise.resolve();await Promise.resolve();
 assert.equal(find(p.render(),n=>n.type==='Confirmation'),null)
 resolve(cart);await pending;tree=p.render();const dialog=find(tree,n=>n.type==='Confirmation');
 assert.equal(dialog.props.addition.quantity,2);assert.equal(dialog.props.cart.items[0].quantity,3)
 assert.equal(dialog.props.addition.trigger,p.trigger);assert.equal(dialog.props.addition.display,display)
 dialog.props.onDismiss();assert.equal(find(p.render(),n=>n.type==='Confirmation'),null)
})
test('failed addition reports an error without a success dialog',async()=>{
 const p=provider(async()=>{throw Error('OUT_OF_STOCK')});await assert.rejects(p.render().props.value.addItem('v'),/OUT_OF_STOCK/)
 const tree=p.render();assert.equal(tree.props.value.error,'OUT_OF_STOCK');assert.equal(find(tree,n=>n.type==='Confirmation'),null)
})
test('navigation clears confirmation instead of reopening it on a later visit',async()=>{
 const p=provider(async()=>cart);await p.render().props.value.addItem('v');p.navigate();p.render();assert.equal(find(p.render(),n=>n.type==='Confirmation'),null)
})
test('dialog uses newly added amount, localized cart path and secondary-before-primary order',()=>{
 const h=hooks();const {AddedToCartDialog}=load('frontend/src/components/cart/AddedToCartDialog.tsx',{
 '@/lib/dialog-backdrop':dialogBackdrop,'@/lib/cart/display':cartDisplay,
 react:{...h.react,useId:()=> 'title'},'@/components/i18n/LocalizedLink':{default:'Link'},
 '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'en',t:(k,args)=>args?`${k}:${args.n}`:k})},
 '@/components/store/ProductImage':{ProductImage:'Image'},'@/lib/product-image':{normalizeImageUrl:v=>v},'@/lib/format-money':{formatMoney:n=>String(n)}
 },{Intl})
 const tree=h.render(()=>AddedToCartDialog({cart,addition:{lineId:'line',quantity:2,trigger:null},onDismiss:()=>{}}))
 assert.equal(find(tree,n=>n.props?.className==='cart-added-price').props.children,'180')
 const actions=find(tree,n=>n.props?.className==='cart-added-actions').props.children
 assert.equal(actions[0].props.children,'cartAdded.continue');assert.equal(actions[1].props.children,'cartAdded.goToCart');assert.equal(actions[1].props.href,'/rs/cart')
 assert.equal(find(tree,n=>n.type==='dialog').props['aria-labelledby'],'title')
})
