// Isolated PostgreSQL schema; never reads application DATABASE_URL.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), ts = require('typescript')
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f)
const { reviewSchema } = require('../src/utils/review-schema.ts')
const { ContainerRegistrationKeys: K, Modules: M } = require('@medusajs/framework/utils')
const reviews = require('../src/api/store/reviews/route.ts')
const vote = require('../src/api/store/reviews/[id]/vote/route.ts')
const summary = require('../src/api/store/reviews/summary/route.ts')
const adminList = require('../src/api/admin/reviews/route.ts')
const adminChange = require('../src/api/admin/reviews/[id]/route.ts')
const connection = process.env.TEST_REVIEWS_DB_URL
if (!connection) throw Error('Set TEST_REVIEWS_DB_URL to an isolated test PostgreSQL database')
const schema = 'tamir_reviews_test_' + process.pid
const knex = require('knex')
const root = knex({client:'pg',connection})
const db = knex({client:'pg',connection,searchPath:[schema],pool:{min:0,max:5}})
const originalFetch = global.fetch, consumed = new Set()
const profiles = {c1:{has_account:true,first_name:'Igor',email:'private@example.test'},c2:{has_account:true,first_name:'Ana',email:'ana@example.test'}}
Object.assign(process.env,{REVIEW_RATE_SECRET:'test-only-key-at-least-32-characters',TURNSTILE_SECRET_KEY:'integration-secret',TURNSTILE_HOSTNAMES:'tamir.rs'})
before(async()=>{
 await root.raw(`CREATE SCHEMA ${schema}`);await db.raw(reviewSchema)
 await db.raw('CREATE TABLE product (id text PRIMARY KEY, title text); CREATE TABLE customer (id text PRIMARY KEY, first_name text, email text)')
 await db('product').insert({id:'prod_1',title:'Shirt'})
 await db('customer').insert(Object.entries(profiles).map(([id,c])=>({id,first_name:c.first_name,email:c.email})))
 global.fetch=async(url,options)=>{
  assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify')
  const token=options.body.get('response'),ok=token&&!consumed.has(token)&&token!=='invalid';consumed.add(token)
  return {ok:true,json:async()=>({success:!!ok,hostname:'tamir.rs',action:'review'})}
 }
})
after(async()=>{global.fetch=originalFetch;await db.destroy();await root.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.destroy()})
function req({customer='c1',body={},query={},params={},admin}={}) {
 return {body,query,params,headers:{},ip:'127.0.0.1',socket:{remoteAddress:'127.0.0.1'},auth_context:admin?{actor_id:admin,actor_type:'user'}:customer?{actor_id:customer,actor_type:'customer'}:{},scope:{resolve(key){
  if(key===K.PG_CONNECTION)return db
  if(key===M.CUSTOMER)return {retrieveCustomer:async id=>profiles[id]}
  if(key===M.USER)return {retrieveUser:async id=>({id,email:id==='owner'?'admin@tamir.local':'vicommsk@gmail.com'})}
  if(key===K.QUERY)return {graph:async({filters})=>({data:filters.id==='prod_1'?[{id:'prod_1',status:'published'}]:[]})}
  throw Error('Unexpected dependency '+key)
 }}}
}
async function call(handler,options) {
 const res={statusCode:200,setHeader(){},status(c){this.statusCode=c;return this},json(b){this.body=b;return this}}
 await handler(req(options),res);return res
}
let reviewId

test('guest posting rejected; validation and CAPTCHA enforced; name spoofing ignored',async()=>{
 assert.equal((await call(reviews.POST,{customer:null,body:{product_id:'prod_1',rating:5,body:'Good',captcha_token:'guest'}})).statusCode,401)
 for(const body of [{rating:0,body:'x'},{rating:5,body:''},{rating:5,body:'x'.repeat(251)},{rating:5,body:'x',captcha_token:'invalid'}]) assert.equal((await call(reviews.POST,{body:{product_id:'prod_1',...body}})).statusCode,400)
 assert.equal(Number((await db('tamir_review').count('* as n').first()).n),0)
 const r=await call(reviews.POST,{body:{product_id:'prod_1',name:'evil@example.test',rating:5,body:'Good',captcha_token:'first'}})
 assert.equal(r.statusCode,201);assert.equal(r.body.review.name,'Igor');assert.ok(!JSON.stringify(r.body).includes('private@example'));reviewId=r.body.review.id
})
test('concurrent duplicate reviews retain only one customer/product rating',async()=>{
 const results=await Promise.all([1,2].map(i=>call(reviews.POST,{customer:'c2',body:{product_id:'prod_1',rating:4,body:'Fine',captcha_token:'concurrent'+i}})))
 assert.deepEqual(results.map(r=>r.statusCode).sort(),[201,409])
 assert.equal(Number((await db('tamir_review').count('* as n').first()).n),2)
 assert.equal((await call(reviews.POST,{body:{product_id:'prod_1',rating:1,body:'Again',captcha_token:'again'}})).statusCode,409)
})
test('token replay and unknown products cannot publish',async()=>{
 const r=await call(reviews.POST,{body:{product_id:'prod_1',rating:5,body:'Replay',captcha_token:'first'}});assert.equal(r.statusCode,400);assert.equal(r.body.code,'CAPTCHA_FAILED')
 assert.equal((await call(reviews.POST,{body:{product_id:'prod_missing',rating:5,body:'x',captcha_token:'unknown'}})).statusCode,404)
})
test('guest vote refused; concurrent opposite own votes become one immutable vote',async()=>{
 assert.equal((await call(vote.POST,{customer:null,params:{id:reviewId},body:{value:1}})).statusCode,401)
 const results=await Promise.all([1,-1].map(value=>call(vote.POST,{params:{id:reviewId},body:{value}})))
 assert.ok(results.every(r=>r.statusCode===200));assert.equal(results.filter(r=>r.body.duplicate).length,1)
 const rows=await db('tamir_review_vote').where({review_id:reviewId,customer_id:'c1'});assert.equal(rows.length,1)
 const again=await call(vote.POST,{params:{id:reviewId},body:{value:-rows[0].value}})
 assert.equal(again.body.score,rows[0].value);assert.equal(again.body.up+again.body.down,1)
})
test('product average ignores usefulness; public JSON excludes private identities',async()=>{
 const s=await call(summary.GET,{query:{product_ids:'prod_1'}});assert.equal(s.body.summaries.prod_1.rating,4.5);assert.equal(s.body.summaries.prod_1.count,2)
 const r=await call(reviews.GET,{customer:null,query:{product_id:'prod_1'}});assert.equal(r.statusCode,200);assert.equal(r.body.rating,4.5)
 for(const item of r.body.reviews) for(const key of ['customer_id','email','author_email','phone']) assert.equal(key in item,false)
 assert.ok(!JSON.stringify(r.body).includes('private@example.test'))
})
test('only designated admin can access author emails and moderation',async()=>{
 for(const options of [{admin:'other'},{customer:'c1'},{customer:null}]) {
  const r=await call(adminList.GET,options);assert.equal(r.statusCode,403);assert.ok(!JSON.stringify(r.body).includes('private@example.test'))
  assert.equal((await call(adminChange.POST,{...options,params:{id:reviewId},body:{status:'hidden'}})).statusCode,403)
 }
 const allowed=await call(adminList.GET,{admin:'owner'});assert.equal(allowed.statusCode,200);assert.ok(allowed.body.reviews.some(r=>r.author_email==='private@example.test'))
})
test('moderation changes average, preserves stars, audits and rejects stale writes',async()=>{
 let row=await db('tamir_review').where('id',reviewId).first()
 let r=await call(adminChange.POST,{admin:'owner',params:{id:reviewId},body:{status:'hidden',rating:1,version:row.version}});assert.equal(r.statusCode,200)
 let s=await call(summary.GET,{query:{product_ids:'prod_1'}});assert.equal(s.body.summaries.prod_1.rating,4);assert.equal(s.body.summaries.prod_1.count,1)
 r=await call(adminChange.POST,{admin:'owner',params:{id:reviewId},body:{status:'published',version:row.version}});assert.equal(r.statusCode,409)
 row=await db('tamir_review').where('id',reviewId).first();assert.equal(Number(row.rating),5)
 r=await call(adminChange.POST,{admin:'owner',params:{id:reviewId},body:{status:'published',version:row.version}});assert.equal(r.statusCode,200)
 s=await call(summary.GET,{query:{product_ids:'prod_1'}});assert.equal(s.body.summaries.prod_1.rating,4.5)
 assert.equal(Number((await db('tamir_review_audit').count('* as n').first()).n),2)
})
test('removal cannot allow a second review and keeps existing votes',async()=>{
 const row=await db('tamir_review').where('id',reviewId).first()
 assert.equal((await call(adminChange.POST,{admin:'owner',params:{id:reviewId},body:{status:'deleted',version:row.version}})).statusCode,200)
 assert.equal((await call(reviews.POST,{body:{product_id:'prod_1',rating:1,body:'Replacement',captcha_token:'replacement'}})).statusCode,409)
 assert.equal(Number((await db('tamir_review_vote').where('review_id',reviewId).count('* as n').first()).n),1)
})
test('schema initialization is idempotent and preserves records',async()=>{await db.raw(reviewSchema);assert.equal(Number((await db('tamir_review').count('* as n').first()).n),2)})
