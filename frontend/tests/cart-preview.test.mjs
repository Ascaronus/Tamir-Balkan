import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { load, hooks, find } from '../test-support/component-harness.mjs'
import { CartPreviewInteraction, cartPreviewPosition } from '../src/lib/cart/preview-interaction.ts'
import { formatMoney } from '../src/lib/format-money.ts'
import { localizedPath } from '../src/lib/i18n/paths.ts'
import { createTranslator } from '../src/lib/i18n/translator.ts'
const display=load('frontend/src/lib/cart/display.ts')
const messages=locale=>JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url)))

test('interaction: 180ms opening, cancelled accidental hover, 220ms closing and safe pointer transfer',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const changes=[],c=new CartPreviewInteraction(v=>changes.push(v))
 c.enterPointer();t.mock.timers.tick(179);assert.deepEqual(changes,[])
 c.leavePointer();t.mock.timers.tick(220);assert.ok(!changes.includes(true))
 c.enterPointer();t.mock.timers.tick(180);assert.equal(changes.at(-1),true)
 c.leavePointer();t.mock.timers.tick(219);assert.equal(changes.at(-1),true)
 c.enterPointer();t.mock.timers.tick(300);assert.equal(changes.at(-1),true)
 c.leavePointer();t.mock.timers.tick(220);assert.equal(changes.at(-1),false);c.dispose()
})
test('interaction: keyboard holds popover after pointer leaves, Escape closes without focus reopening',t=>{
 t.mock.timers.enable({apis:['setTimeout']});let open=false;const c=new CartPreviewInteraction(v=>open=v)
 c.focusWithin(true);assert.equal(open,true);c.leavePointer();t.mock.timers.tick(500);assert.equal(open,true)
 c.dismiss();c.focusWithin(true);t.mock.timers.tick(500);assert.equal(open,false)
 c.blurOutside();c.focusWithin(true);assert.equal(open,true)
 c.blurOutside();t.mock.timers.tick(219);assert.equal(open,true);t.mock.timers.tick(1);assert.equal(open,false)
 c.enterPointer();c.dispose();t.mock.timers.tick(500);assert.equal(open,false)
})
test('position stays inside narrow and short viewports, right-aligned when space permits',()=>{
 const normal=cartPreviewPosition({right:1200,bottom:100},{width:1280,height:800})
 assert.deepEqual(normal,{width:380,left:820,top:108,maxHeight:520})
 for(const viewport of [{width:320,height:640},{width:390,height:300},{width:800,height:200}]){
  const p=cartPreviewPosition({right:viewport.width-16,bottom:170},viewport)
  assert.ok(p.left>=16);assert.ok(p.left+p.width<=viewport.width-16);assert.ok(p.top+p.maxHeight<=viewport.height-16)
 }
})
test('shared amounts preserve server discounts and zero totals; item URL retains variant and locale',()=>{
 const item={product_handle:'zimska-kapa',variant_id:'variant 50',quantity:3,unit_price:100,total:250}
 assert.equal(display.cartLineTotal(item),250);assert.equal(display.cartLineTotal({...item,total:0}),0)
 assert.equal(display.cartProductsTotal({item_total:0,item_subtotal:300}),0)
 assert.equal(display.cartLineHref(item,'sr'),'/rs/products/zimska-kapa?v_id=variant%2050')
 assert.equal(display.cartLineHref({...item,product_handle:'winter-hat'},'en'),'/en/products/winter-hat?v_id=variant%2050')
 assert.equal(display.cartLineHref({...item,product_handle:null},'en'),null)
})
function contents(locale,initial={}){
 let state={cart:null,isReady:true,isMutating:false,error:null,displayReady:true,displayError:false,retryDisplay:async()=>{},...initial}
 const {CartPreviewContents}=load('frontend/src/components/cart/CartPreview.tsx',{
  react:{},'next/navigation':{},'@/components/i18n/LocalizedLink':{default:'Link'},
  '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale,t:createTranslator(messages(locale))})},
  '@/components/store/ProductImage':{ProductImage:'Image'},'@/lib/product-image':{normalizeImageUrl:v=>v},
  '@/lib/format-money':{formatMoney},'@/lib/cart/display':display,
  '@/lib/cart/preview-interaction':{CartPreviewInteraction,cartPreviewPosition},
  './CartProvider':{useCart:()=>state},'./CartLink':{CartLink:'Badge'},
 })
 return {render:()=>CartPreviewContents({onNavigate(){}}),set:patch=>state={...state,...patch}}
}
for(const locale of ['sr','en']){
 test(`component ${locale}: empty cart has no amount or cart CTA`,()=>{
  const c=contents(locale),tree=c.render();assert.equal(tree.props.children,locale==='sr'?'Korpa je prazna':'Your cart is empty')
  assert.equal(find(tree,n=>n.type==='Link'),null);assert.equal(find(tree,n=>n.props?.className==='cart-preview-total'),null)
 })
 test(`component ${locale}: localized item links, quantity, unit price, server line total and updates`,()=>{
  const cart={currency_code:'rsd',item_total:250,items:[{id:'line',product_title:locale==='sr'?'Zimska kapa':'Winter hat',product_handle:locale==='sr'?'zimska-kapa':'winter-hat',variant_title:locale==='sr'?'Siva / 50':'Gray / 50',variant_id:'v_50',quantity:3,unit_price:100,total:250}]}
  const c=contents(locale,{cart});let tree=c.render(),link=find(tree,n=>n.props?.className==='cart-preview-item')
  assert.equal(link.type,'Link');assert.equal(link.props.href,`/${locale==='sr'?'rs':'en'}/products/${cart.items[0].product_handle}?v_id=v_50`)
  assert.equal(find(tree,n=>n.props?.className==='cart-preview-name').props.children,cart.items[0].product_title)
  assert.equal(find(tree,n=>n.props?.className==='cart-preview-options').props.children,cart.items[0].variant_title)
  const money=n=>formatMoney(n,'rsd',locale==='sr'?'sr-Latn-RS':'en-GB')
  assert.deepEqual([...find(tree,n=>n.props?.className==='cart-preview-unit').props.children],[3,' × ',money(100)])
  assert.equal(find(link,n=>n.type==='strong').props.children,money(250))
  const cta=find(tree,n=>n.props?.className==='button-primary');assert.equal(cta.props.children,locale==='sr'?'Pogledaj korpu':'View cart')
  assert.equal(localizedPath(cta.props.href,locale),locale==='sr'?'/rs/korpa':'/en/cart')
  c.set({cart:{...cart,item_total:90,items:[{...cart.items[0],quantity:1,total:90}]}});tree=c.render()
  assert.equal(find(find(tree,n=>n.props?.className==='cart-preview-total'),n=>n.type==='strong').props.children,money(90))
  c.set({cart:{...cart,items:[]}});assert.equal(find(c.render(),n=>n.props?.className==='cart-preview-footer'),null)
 })
 test(`component ${locale}: loading and failed refresh hide stale cart and expose explicit retry`,async()=>{
  let retries=0;const c=contents(locale,{cart:{currency_code:'rsd',items:[{id:'old',product_title:'STALE'}]},isReady:false,retryDisplay:async()=>retries++})
  assert.equal(c.render().props.role,'status')
  c.set({isReady:true,error:'private server details'});let tree=c.render();assert.equal(tree.props.role,'alert')
  assert.equal(tree.props.children[0].props.children,locale==='sr'?'Korpa nije mogla da se učita.':'Could not load your cart.')
  assert.ok(!JSON.stringify(tree).includes('STALE'));assert.ok(!JSON.stringify(tree).includes('private server details'))
  find(tree,n=>n.type==='button').props.onClick();await Promise.resolve();assert.equal(retries,1)
  c.set({error:null,displayReady:false,displayError:false});assert.equal(c.render().props.role,'status')
  c.set({displayError:true});assert.equal(c.render().props.role,'alert')
  c.set({isMutating:true});assert.equal(c.render().props.role,'status')
 })
}
test('component: touch does not open preview; mouse/focus open; cart click is still a link',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const h=hooks(),listeners={},cleanups=[];let hover=true,focusCalls=0
 const anchor={getBoundingClientRect:()=>({right:700,bottom:100}),focus:()=>focusCalls++}
 const root={contains:value=>value==='inside'}
 const react={...h.react,useId:()=> 'preview',useEffect:(fn,deps)=>h.react.useEffect(()=>{const c=fn();if(c)cleanups.push(c)},deps)}
 const {CartPreviewControl}=load('frontend/src/components/cart/CartPreview.tsx',{
  react,'next/navigation':{},'@/components/i18n/LocalizedLink':{default:'Link'},
  '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'en',t:createTranslator(messages('en'))})},
  '@/components/store/ProductImage':{},'@/lib/product-image':{},'@/lib/format-money':{},'@/lib/cart/display':display,
  '@/lib/cart/preview-interaction':{CartPreviewInteraction,cartPreviewPosition},'./CartProvider':{},'./CartLink':{CartLink:'Badge'},
 },{window:{matchMedia:()=>({matches:hover}),innerWidth:800,innerHeight:700,addEventListener(){},removeEventListener(){}},document:{activeElement:'inside',addEventListener:(k,fn)=>listeners[k]=fn,removeEventListener:k=>delete listeners[k]}})
 const render=()=>{const tree=h.render(()=>CartPreviewControl());tree.props.ref.current=root;find(tree,n=>n.type==='Link').props.ref.current=anchor;return tree}
 let tree=render();await h.flush();tree.props.onPointerEnter({pointerType:'touch'});t.mock.timers.tick(500);assert.equal(find(render(),n=>n.type==='section'),null)
 hover=false;tree.props.onPointerEnter({pointerType:'mouse'});t.mock.timers.tick(500);assert.equal(find(render(),n=>n.type==='section'),null)
 hover=true;tree.props.onPointerEnter({pointerType:'mouse'});t.mock.timers.tick(180);tree=render();await h.flush();tree=render();assert.ok(find(tree,n=>n.type==='section'))
 let prevented=false;listeners.keydown({key:'Escape',preventDefault:()=>prevented=true});assert.equal(prevented,true);assert.equal(focusCalls,1);assert.equal(find(render(),n=>n.type==='section'),null)
 tree.props.onBlur({currentTarget:root,relatedTarget:'outside'});tree.props.onFocus({target:{matches:()=>true}});assert.ok(find(render(),n=>n.type==='section'))
 const link=find(render(),n=>n.type==='Link');assert.equal(link.props.href,'/rs/cart');link.props.onClick();assert.equal(find(render(),n=>n.type==='section'),null)
 cleanups.forEach(fn=>fn());assert.equal(listeners.keydown,undefined)
})
