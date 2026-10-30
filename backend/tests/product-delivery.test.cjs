const {test}=require('node:test')
const assert=require('node:assert/strict')
require('ts-node/register/transpile-only')
const {ContainerRegistrationKeys}=require('@medusajs/framework/utils')
const {GET}=require('../src/api/store/product-delivery/route')
const option=(amount=0,extra={})=>({id:'so_a',name:'Standard',price_type:'flat',shipping_profile_id:'sp_a',provider:{is_enabled:true},service_zone:{fulfillment_set:{type:'shipping'}},calculated_price:{calculated_amount:amount},...extra})
function fixture({methods=[option()],published=true,channel='sc_a',profile='sp_a',failure=false}={}){
 const calls=[]
 const req={query:{product_id:'prod_a'},publishable_key_context:{sales_channel_ids:['sc_a']},scope:{resolve(key){
  if(key===ContainerRegistrationKeys.QUERY)return {graph:async(input,config)=>{
   calls.push(input);assert.equal(config.cache.enable,false)
   if(failure)throw Error('private database error')
   if(input.entity==='product')return {data:[{status:published?'published':'draft',sales_channels:[{id:channel}],shipping_profile:profile?{id:profile}:null}]}
   if(input.entity==='region')return {data:[{id:'reg_a',currency_code:'rsd',countries:[{iso_2:'rs'}]}]}
   return {data:[{stock_locations:[{fulfillment_sets:[{id:'fs_a'}]}]}]}
  }}
  if(key===ContainerRegistrationKeys.REMOTE_QUERY)return async input=>{calls.push(input);return methods}
  throw Error('unexpected service')
 }}}
 async function run(){const result={status:200,headers:{}};const res={setHeader:(k,v)=>result.headers[k]=v,status:n=>{result.status=n;return res},json:body=>{result.body=body;return res}};await GET(req,res);return result}
 return {req,calls,run}
}
test('handler: current admin amounts including zero use Medusa context, no-store and public response only',async()=>{
 for(const amount of [0,450,299.5]){
  const f=fixture({methods:[option(amount,{data:{secret:'hidden'}})]}),r=await f.run()
  assert.deepEqual(r.body,{options:[{id:'so_a',name:'Standard',amount,currency_code:'rsd'}],requires_checkout:false});assert.equal(r.headers['Cache-Control'],'no-store')
  const q=f.calls.at(-1);assert.deepEqual(q.variables.context,{enabled_in_store:'true',is_return:'false'})
  assert.deepEqual(q.variables.filters,{fulfillment_set_id:['fs_a'],fulfillment_set_type:'shipping',shipping_profile_id:'sp_a',address:{country_code:'rs'}})
  assert.deepEqual(q.variables.calculated_price.context,{currency_code:'rsd',region_id:'reg_a'})
 }
})
test('handler: pickup, disabled providers and unrelated shipping profiles never advertise free delivery',async()=>{
 const f=fixture({methods:[option(0,{service_zone:{fulfillment_set:{type:'pickup'}}}),option(0,{provider:{is_enabled:false}}),option(0,{shipping_profile_id:'sp_b'}),option(500)]})
 assert.deepEqual((await f.run()).body.options.map(o=>o.amount),[500])
})
test('handler: missing/invalid/calculated rates stay unknown instead of turning into free',async()=>{
 for(const method of [option(null),option(undefined,{calculated_price:null}),option(-1),option(NaN),option(0,{price_type:'calculated'})]){
  const r=await fixture({methods:[method]}).run();assert.deepEqual(r.body,{options:[],requires_checkout:true})
 }
 const r=await fixture({methods:[option(0),option(0,{price_type:'calculated'})]}).run();assert.equal(r.body.requires_checkout,true);assert.equal(r.body.options[0].amount,0)
})
test('handler: rejects invalid IDs, unpublished and off-channel products; no profile means unknown',async()=>{
 const f=fixture();f.req.query.product_id='../private';assert.equal((await f.run()).status,400);assert.equal(f.calls.length,0)
 for(const options of [{published:false},{channel:'sc_b'}])assert.equal((await fixture(options).run()).status,404)
 assert.deepEqual((await fixture({profile:null}).run()).body,{options:[],requires_checkout:true})
})
test('handler: service failure is safe and never becomes a zero-price quote',async()=>{
 const r=await fixture({failure:true}).run();assert.equal(r.status,503);assert.deepEqual(r.body,{code:'DELIVERY_UNAVAILABLE'})
})
