import test from 'node:test'
import assert from 'node:assert/strict'
import {load,find} from '../test-support/component-harness.mjs'
function render(product, locale='en') {
 const {ProductAttributes}=load('frontend/src/components/product/ProductAttributes.tsx',{'@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale,t:k=>k})}})
 return ProductAttributes({product})
}
function rows(tree) { return find(tree,n=>n.type==='dl').props.children.map(n=>n.props.children.map(c=>c.props.children)) }
test('empty attributes produce no heading or disclosure, and metadata is not exposed',()=>{
 for(const product of [{},{length:null,width:null,height:null,weight:null,origin_country:' ',mid_code:'',hs_code:''},{metadata:{secret:'private'},material:'50% viscose, 50% acrylic.'}]) assert.equal(render(product),null)
})
test('filled attributes preserve zero and fractional values and hide absent dimensions',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(rows(render({length:0,width:1.25,weight:.005,height:null},'sr')))),[['product.attributeLabels.length','0'],['product.attributeLabels.width','1,25'],['product.attributeLabels.weight','0,005']])
 assert.equal(render({length:NaN,width:Infinity,height:-1}),null)
})
test('country names are localized and populated codes are trimmed',()=>{
 const result=JSON.parse(JSON.stringify(rows(render({origin_country:'ua',mid_code:' maker ',hs_code:' 6505 '}))))
 assert.deepEqual(result,[['product.attributeLabels.origin_country','Ukraine'],['product.attributeLabels.mid_code','maker'],['product.attributeLabels.hs_code','6505']])
})
test('clearing the fields hides the block on the next render',()=>{
 assert.ok(render({height:12.5}));assert.equal(render({height:null}),null)
})
