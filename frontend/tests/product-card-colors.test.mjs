import test from 'node:test'
import assert from 'node:assert/strict'
import {load,find} from '../test-support/component-harness.mjs'
import {canPurchase,matchingVariant} from '../src/lib/store/commerce.ts'
const {ProductCard}=load('frontend/src/components/store/ProductCard.tsx',{
 'next/link':{default:'Link'},'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({t:k=>k,locale:'sr'})},
 '@/components/reviews/Stars':{Stars:'Stars',ReviewIcon:'ReviewIcon'},
 '@/lib/store/catalog':{isColorOption:t=>t==='Color',colorSwatch:c=>c==='Black'?'#000000':undefined},
 '@/lib/store/commerce':{canPurchase,matchingVariant},'@/lib/format-money':{formatMoney:()=>''},
 '@/lib/i18n/content':{localizedText:(_,__,title)=>title},'@/lib/product-image':{getStoreProductImageUrl:()=>''},'./ProductImage':{ProductImage:'Image'}
})
const variant=(id,size,color)=>({id,options:[{option_id:'size',value:size},{option_id:'color',value:color}],manage_inventory:false,calculated_price:{calculated_amount:100}})
function product(variants){return {title:'Shirt',handle:'shirt',options:[{id:'color',title:'Color',values:['Black','Custom','Missing'].map(value=>({value}))}],variants,catalog:{preferred_variant_id:'custom-l',currency_code:'rsd',price:100}}}
test('card color links select the requested color and preserve the catalog variant size',()=>{
 const tree=ProductCard({product:product([variant('black-m','M','Black'),variant('black-l','L','Black'),variant('custom-l','L','Custom')])})
 const black=find(tree,n=>n.props?.['aria-label']==='design.color: Black')
 assert.equal(black.type,'Link');assert.equal(black.props.href,'/rs/products/shirt?v_id=black-l');assert.equal(black.props.prefetch,false)
 const custom=find(tree,n=>n.props?.['aria-label']==='design.color: Custom')
 assert.equal(custom.props.href,'/rs/products/shirt?v_id=custom-l')
 const missing=find(tree,n=>n.props?.['aria-label']==='design.color: Missing')
 assert.equal(missing.type,'span');assert.equal(missing.props['aria-disabled'],'true');assert.equal(missing.props.href,undefined)
})
test('card color links fall back to a real variant when the preferred size has no such color',()=>{
 const tree=ProductCard({product:product([variant('black-m','M','Black'),variant('custom-l','L','Custom')])})
 assert.equal(find(tree,n=>n.props?.['aria-label']==='design.color: Black').props.href,'/rs/products/shirt?v_id=black-m')
})
