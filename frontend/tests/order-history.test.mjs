import test from 'node:test'
import assert from 'node:assert/strict'
import {load,hooks,find} from '../test-support/component-harness.mjs'

function setup(fetch) {
 const h=hooks()
 const c=load('frontend/src/components/auth/OrderHistoryDetails.tsx',{
  react:h.react,
  '@/lib/medusa':{sdk:{client:{fetch}}},
  '@/lib/auth/auth-storage':{getAuthToken:()=> 'customer-token'},
  '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'en',t:k=>k})},
  '@/lib/format-money':load('frontend/src/lib/format-money.ts'),
 })
 const order={id:'own',currency_code:'rsd',total:3200,status:'completed',fulfillment_status:'shipped'}
 return {h,render:()=>h.render(()=>c.OrderHistoryDetails({order}))}
}
test('order details show historical item prices and separate shipping status',async()=>{
 let query
 const {h,render}=setup(async(path,options)=>{
  assert.equal(path,'/store/orders');assert.equal(options.headers.authorization,'Bearer customer-token')
  query=options.query
  return {orders:[{id:'own',total:3200,subtotal:3000,shipping_total:200,tax_total:0,discount_total:0,
   items:[{id:'line',product_title:'Historical shirt',variant_title:'XL',unit_price:1500,quantity:2,total:3000}]}]}
 })
 let tree=render()
 assert.ok(JSON.stringify(tree).includes('account.statuses.shipped'))
 find(tree,n=>n.type==='button').props.onClick()
 await h.flush();tree=render()
 assert.equal(query.id,'own')
 const text=JSON.stringify(tree)
 assert.ok(text.includes('Historical shirt'));assert.ok(text.includes('XL'))
 assert.ok(text.includes('1,500'));assert.ok(text.includes('3,000'))
})
test('order detail error can be retried and unrelated orders are not displayed',async()=>{
 let calls=0
 const {h,render}=setup(async()=> ++calls===1?{orders:[{id:'someone-else',items:[{product_title:'PRIVATE'}]}]}:{orders:[{id:'own',items:[],total:3200}]})
 find(render(),n=>n.type==='button').props.onClick()
 await h.flush();let tree=render()
 assert.ok(find(tree,n=>n.props?.role==='alert'))
 assert.ok(!JSON.stringify(tree).includes('PRIVATE'))
 await find(tree,n=>n.type==='button'&&n.props.children==='common.retry').props.onClick()
 tree=render()
 assert.equal(find(tree,n=>n.props?.role==='alert'),null)
})
