import test from 'node:test'
import assert from 'node:assert/strict'
import {load,find,hooks} from '../test-support/component-harness.mjs'
import {canPurchase,matchingVariant,variantAmount} from '../src/lib/store/commerce.ts'
import {getImagesForVariant,getStoreProductImageUrl} from '../src/lib/product-image.ts'
function card(initialProduct) {
 const state=hooks()
 const {ProductCard}=load('frontend/src/components/store/ProductCard.tsx',{
  react:state.react,'next/link':{default:'Link'},'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({t:k=>k,locale:'sr'})},
  '@/components/reviews/Stars':{Stars:'Stars',ReviewIcon:'ReviewIcon'},
  '@/lib/store/catalog':{isColorOption:t=>t==='Color',colorSwatch:c=>c==='Black'?'#000000':undefined},
  '@/lib/store/commerce':{canPurchase,matchingVariant,variantAmount},'@/lib/format-money':{formatMoney:p=>String(p)},
  '@/lib/i18n/content':{localizedText:(_,__,title)=>title},'@/lib/product-image':{getImagesForVariant,getStoreProductImageUrl},'./ProductImage':{ProductImage:'Image'}
 })
 let product=initialProduct
 return {render(next=product){product=next;return state.render(()=>ProductCard({product}))}}
}
const variant=(id,size,color)=>({id,images:[{id:'im-'+id,url:`https://example.test/${color}.jpg`}],options:[{option_id:'size',value:size},{option_id:'color',value:color}],manage_inventory:false,calculated_price:{calculated_amount:100}})
function product(variants){return {id:'shirt',title:'Shirt',handle:'shirt',thumbnail:'https://example.test/default.jpg',options:[{id:'color',title:'Color',values:['Black','Custom','Missing'].map(value=>({value}))}],variants,catalog:{preferred_variant_id:'custom-l',currency_code:'rsd',price:100}}}
const color=(tree,value)=>find(tree,n=>n.props?.['aria-label']===`design.color: ${value}`)
const price=tree=>find(tree,n=>n.props?.className==='product-card-price').props.children
const image=tree=>find(tree,n=>n.type==='Image').props.src
const href=tree=>find(tree,n=>n.props?.className==='product-card-image').props.href

test('color click updates only this card, preserving size, linked photo and tax-inclusive price',()=>{
 const black=variant('black-l','L','Black');black.calculated_price={calculated_amount:200,calculated_amount_with_tax:240}
 const p=product([variant('black-m','M','Black'),black,variant('custom-l','L','Custom')])
 const first=card(p),neighbor=card({...p,id:'neighbor'})
 let tree=first.render();const other=neighbor.render()
 assert.equal(image(tree),'https://example.test/Custom.jpg');assert.equal(price(tree),'100')
 const button=color(tree,'Black');assert.equal(button.type,'button');assert.equal(button.props.href,undefined)
 button.props.onClick();tree=first.render()
 assert.equal(image(tree),'https://example.test/Black.jpg');assert.equal(price(tree),'240')
 assert.equal(href(tree),'/rs/products/shirt?v_id=black-l')
 assert.equal(color(tree,'Black').props['aria-pressed'],true);assert.equal(color(tree,'Custom').props['aria-pressed'],false)
 assert.equal(find(tree,n=>n.props?.className==='product-card-rating').props.href,'/rs/products/shirt?v_id=black-l#reviews')
 assert.equal(image(neighbor.render()),image(other));assert.equal(price(neighbor.render()),price(other));assert.equal(href(neighbor.render()),href(other))
 color(tree,'Custom').props.onClick();tree=first.render();assert.equal(price(tree),'100');assert.equal(image(tree),'https://example.test/Custom.jpg')
})
test('missing color is disabled; another size is selected only when requested color needs it',()=>{
 const instance=card(product([variant('black-m','M','Black'),variant('custom-l','L','Custom')]))
 let tree=instance.render();assert.equal(color(tree,'Missing').props.disabled,true)
 color(tree,'Black').props.onClick();tree=instance.render();assert.equal(href(tree),'/rs/products/shirt?v_id=black-m')
})
test('variant without price or photo uses price-on-request and product photo, not another variant price',()=>{
 const black=variant('black-l','L','Black');delete black.calculated_price;black.images=[]
 const instance=card(product([black,variant('custom-l','L','Custom')]))
 color(instance.render(),'Black').props.onClick();const tree=instance.render()
 assert.equal(price(tree),'catalog.priceOnRequest');assert.equal(image(tree),'https://example.test/default.jpg')
})
test('fresh catalog preference or another product supersedes the local selection',()=>{
 const p=product([variant('black-m','M','Black'),variant('black-l','L','Black'),variant('custom-l','L','Custom')]);const instance=card(p)
 color(instance.render(),'Black').props.onClick();assert.equal(href(instance.render()),'/rs/products/shirt?v_id=black-l')
 assert.equal(href(instance.render({...p,catalog:{...p.catalog,preferred_variant_id:'black-m'}})),'/rs/products/shirt?v_id=black-m')
 assert.equal(href(instance.render({...p,id:'another'})),'/rs/products/shirt?v_id=custom-l')
})
