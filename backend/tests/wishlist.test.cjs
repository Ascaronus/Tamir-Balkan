const { test }=require('node:test')
const assert=require('node:assert/strict')
require('ts-node/register/transpile-only')
const {ContainerRegistrationKeys,Modules}=require('@medusajs/framework/utils')
const {GET,POST}=require('../src/api/store/wishlist/route')
const {DELETE}=require('../src/api/store/wishlist/[productId]/route')
const {validFavoriteProduct}=require('../src/utils/wishlist')
function fixture({owner='cus_a',account=true,available=true,channel=true}={}) {
 const rows=[],calls=[]
 const db=()=>{let filter={};const builder={
  where(f){filter=f;return builder},orderBy(){return builder},select:async()=>rows.filter(r=>r.customer_id===filter.customer_id),
  insert(row){calls.push(['insert',row]);return {onConflict:()=>({ignore:async()=>{if(!rows.some(r=>r.customer_id===row.customer_id&&r.product_id===row.product_id))rows.push(row)}})}},
  delete:async()=>{for(let i=rows.length-1;i>=0;i--)if(rows[i].customer_id===filter.customer_id&&rows[i].product_id===filter.product_id)rows.splice(i,1)}
 };return builder}
 const req={auth_context:owner?{actor_id:owner,actor_type:'customer'}:undefined,publishable_key_context:{sales_channel_ids:['sc_a']},body:{product_id:'prod_a'},params:{productId:'prod_a'},query:{customer_id:'cus_b'},scope:{resolve(key){
 if(key===ContainerRegistrationKeys.PG_CONNECTION)return db
 if(key===Modules.CUSTOMER)return {retrieveCustomer:async()=>({has_account:account})}
 if(key===ContainerRegistrationKeys.QUERY)return {graph:async()=>({data:available?[{id:'prod_a',status:'published',sales_channels:[{id:channel?'sc_a':'sc_b'}]}]:[]})}
 throw Error('unexpected dependency')
 }}}
 async function run(handler){const result={status:200,headers:{}};const res={setHeader:(k,v)=>result.headers[k]=v,status:n=>{result.status=n;return res},json:body=>{result.body=body;return res}};await handler(req,res);return result}
 return {req,run,rows,calls}
}
test('handler: unauthenticated and non-account customers cannot read or mutate',async()=>{
 for(const options of [{owner:null},{account:false}])for(const route of [GET,POST,DELETE]){const f=fixture(options);assert.equal((await f.run(route)).status,401);assert.equal(f.calls.length,0)}
})
test('handler: client owner injection rejected; malformed IDs rejected before persistence',async()=>{
 const f=fixture();f.req.body.customer_id='cus_b';assert.equal((await f.run(POST)).status,400)
 for(const id of ['',null,{},'../prod_a','prod_'+'a'.repeat(101)]){f.req.body={product_id:id};assert.equal((await f.run(POST)).status,400);assert.equal(validFavoriteProduct(id),false)}
 assert.equal(f.calls.length,0)
})
test('handler: missing, unpublished and off-channel products are not saved',async()=>{
 for(const options of [{available:false},{channel:false}]){const f=fixture(options);assert.equal((await f.run(POST)).status,404);assert.equal(f.calls.length,0)}
})
test('handler: confirmed idempotent responses are private; ownership always comes from auth',async()=>{
 const f=fixture();assert.deepEqual((await f.run(POST)).body,{product_id:'prod_a',saved:true});await f.run(POST)
 assert.equal(f.rows.length,1);assert.equal(f.rows[0].customer_id,'cus_a')
 const list=await f.run(GET);assert.deepEqual(list.body,{product_ids:['prod_a']});assert.equal(list.headers['Cache-Control'],'private, no-store')
 f.req.auth_context.actor_id='cus_b';assert.deepEqual((await f.run(GET)).body,{product_ids:[]});await f.run(DELETE);assert.equal(f.rows.length,1)
 f.req.auth_context.actor_id='cus_a';assert.deepEqual((await f.run(DELETE)).body,{product_id:'prod_a',saved:false});await f.run(DELETE);assert.equal(f.rows.length,0)
})
test('handler: unavailable database returns a safe error without SQL or account information',async()=>{
 const f=fixture();const original=f.req.scope.resolve;f.req.scope.resolve=k=>{if(k===ContainerRegistrationKeys.PG_CONNECTION)throw Error('secret SQL');return original(k)}
 const result=await f.run(GET);assert.equal(result.status,503);assert.deepEqual(result.body,{code:'WISHLIST_UNAVAILABLE'})
})
