const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
require('ts-node/register/transpile-only')
const { ContainerRegistrationKeys: Keys, Modules } = require('@medusajs/framework/utils')
const originalLoad = Module._load
Module._load = function(id, ...args) {
  if (id === '@medusajs/core-flows') return {
    createCartWorkflow: scope => ({ run: async ({input}) => { scope.calls.push(['create', input]); return {result:{id:'cart_new'}} } }),
    transferCartCustomerWorkflow: scope => ({ run: async ({input}) => { scope.calls.push(['transfer', input]) } }),
  }
  return originalLoad.call(this, id, ...args)
}
const { protectCustomerCart } = require('../src/utils/customer-cart')
const { POST } = require('../src/api/store/customer-cart/route')
Module._load = originalLoad
function fixture({owner='cus_a', account=true, existing=null, guest=null, claim=null}={}) {
  const calls=[], filters=[], locks=[]
  const query={join(){return this},insert(v){calls.push(["claim",v]);return this},onConflict(){return this},ignore(){return this},where(v){filters.push(v);return this},whereNull(v){filters.push(v);return this},orderBy(){return this},async first(){return existing}}
  const tx=table=>({...query,async first(){return table==='cart'?existing:claim}})
  tx.transaction=fn=>fn(tx)
  tx.raw=async (_sql,params)=>locks.push(...params)
  const scope={calls,resolve(key){
    if(key===Modules.CUSTOMER)return {retrieveCustomer:async()=>({has_account:account})}
    if(key===Keys.PG_CONNECTION)return tx
    if(key===Keys.QUERY)return {graph:async()=>({data:guest?[guest]:[]})}
    throw Error(key)
  }}
  const req={scope,body:{region_id:'reg_rs',country_code:'rs'},publishable_key_context:{sales_channel_ids:['sc_a']},auth_context:owner?{actor_id:owner,actor_type:'customer'}:undefined,originalUrl:'/store/carts/cart_guest/line-items'}
  return {req,calls,filters,locks}
}
async function invoke(fn,req) {
  const result={status:200,next:false,headers:{}}
  const res={status(n){result.status=n;return this},json(body){result.body=body;return this},setHeader(k,v){result.headers[k]=v}}
  await fn(req,res,()=>{result.next=true})
  return result
}
test('restores latest unfinished account cart without rewriting its quantities',async()=>{
  const f=fixture({existing:{id:'cart_saved'}})
  const r=await invoke(POST,f.req)
  assert.equal(r.body.cart_id,'cart_saved');assert.equal(r.headers['Cache-Control'],'private, no-store')
  assert.deepEqual(f.filters,[{'tamir_customer_cart.customer_id':'cus_a','cart.customer_id':'cus_a','cart.region_id':'reg_rs','cart.sales_channel_id':'sc_a'},'cart.completed_at','cart.deleted_at'])
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.locks,['customer-cart:cus_a:reg_rs:sc_a'])
})
test('requires a registered server-authenticated customer and rejects ownership injection',async()=>{
  for(const options of [{owner:null},{account:false}])assert.equal((await invoke(POST,fixture(options).req)).status,401)
  for(const body of [null,{region_id:'reg_rs',country_code:'rs',customer_id:'cus_b'},{region_id:'bad',country_code:'rs'}]){
    const f=fixture();f.req.body=body;assert.equal((await invoke(POST,f.req)).status,400);assert.deepEqual(f.calls,[])
  }
})
test('claims only an unfinished guest cart in the same market and sales channel',async()=>{
  const guest={id:'cart_guest',region_id:'reg_rs',sales_channel_id:'sc_a',customer:{has_account:false}}
  const f=fixture({guest});f.req.body.guest_cart_id=guest.id
  assert.equal((await invoke(POST,f.req)).body.claimed_guest,true)
  assert.deepEqual(f.calls,[['transfer',{id:guest.id,customer_id:'cus_a'}],['claim',{cart_id:guest.id,customer_id:'cus_a'}]])
  assert.ok(f.locks.includes('customer-cart-claim:cart_guest'))
  for(const patch of [{customer:{has_account:true}},{completed_at:new Date()},{region_id:'reg_else'},{sales_channel_id:'sc_else'}]){
    const invalid=fixture({guest:{...guest,...patch}});invalid.req.body.guest_cart_id=guest.id
    assert.equal((await invoke(POST,invalid.req)).body.claimed_guest,false)
    assert.equal(invalid.calls[0][0],'create');assert.equal(invalid.calls[0][1].customer_id,'cus_a')
  }
})
test('keeps a separate guest cart when an account cart exists and fails closed on storage failure',async()=>{
  const f=fixture({existing:{id:'cart_saved'}});f.req.body.guest_cart_id='cart_guest'
  assert.deepEqual((await invoke(POST,f.req)).body,{cart_id:'cart_saved',claimed_guest:false});assert.deepEqual(f.calls,[])
  f.req.scope.resolve=()=>{throw Error('database details')}
  assert.deepEqual((await invoke(POST,f.req)).body,{code:'CART_UNAVAILABLE'})
})
test('native cart read, mutation, completion and transfer reject anonymous and foreign owners',async()=>{
  for(const path of ['', '/line-items','/complete','/customer'])for(const owner of [null,'cus_b','cus_a']){
    const f=fixture({owner,claim:{customer_id:'cus_a'}})
    f.req.originalUrl='/store/carts/cart_guest'+path+'?fields=id'
    const r=await invoke(protectCustomerCart,f.req)
    assert.equal(r.status,owner==='cus_a'?200:owner?404:401);assert.equal(r.next,owner==='cus_a')
  }
  const f=fixture({owner:null,guest:{id:'cart_guest',customer:{has_account:false}}})
  assert.equal((await invoke(protectCustomerCart,f.req)).next,true)
})

test('a server-owned claim cannot be stolen even if native customer data was changed',async()=>{
  const f=fixture({claim:{customer_id:'cus_b'},guest:{id:'cart_guest',region_id:'reg_rs',sales_channel_id:'sc_a',customer:{has_account:false}}})
  f.req.body.guest_cart_id='cart_guest'
  assert.equal((await invoke(POST,f.req)).body.cart_id,'cart_new')
  assert.equal(f.calls.some(call=>call[0]==='transfer'),false)
})
test('encoded cart IDs receive ownership checks; matching guest email is not a private claim',async()=>{
  const privateCart=fixture({owner:null,claim:{customer_id:'cus_a'}})
  privateCart.req.originalUrl='/store/carts/%63art_guest'
  assert.equal((await invoke(protectCustomerCart,privateCart.req)).status,401)
  const guest=fixture({owner:null,guest:{id:'cart_guest',customer_id:'cus_a',customer:{has_account:true}}})
  assert.equal((await invoke(protectCustomerCart,guest.req)).next,true)
})
