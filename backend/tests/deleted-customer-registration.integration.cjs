// Isolated schema; never uses the application's DATABASE_URL.
const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { releaseDeletedCustomerIdentity } = require('../src/utils/deleted-customer-registration')
const connection = process.env.TEST_REVIEWS_DB_URL
if (!connection) throw Error('Set TEST_REVIEWS_DB_URL to an isolated PostgreSQL database')
const knex = require('knex')
const schema = 'tamir_identity_test_' + process.pid
const root = knex({client:'pg',connection})
const db = knex({client:'pg',connection,searchPath:[schema]})
before(async()=>{
 await root.raw(`CREATE SCHEMA ${schema}`)
 await db.raw(`CREATE TABLE auth_identity (id text PRIMARY KEY, app_metadata jsonb, deleted_at timestamptz, updated_at timestamptz);
 CREATE TABLE provider_identity (id text PRIMARY KEY, auth_identity_id text, provider text, entity_id text, deleted_at timestamptz);
 CREATE TABLE customer (id text PRIMARY KEY, email text, has_account boolean, deleted_at timestamptz);`)
})
after(async()=>{await db.destroy();await root.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.destroy()})
let seq=0
async function fixture({metadata={customer_id:null},deleted=true,active=false,guest=false,otherProvider=false}={}) {
 const id='auth_'+(++seq), email=`customer${seq}@example.test`
 await db('auth_identity').insert({id,app_metadata:metadata})
 await db('provider_identity').insert({id:'pi_'+seq,auth_identity_id:id,provider:'emailpass',entity_id:email})
 if(deleted) await db('customer').insert({id:'deleted_'+seq,email,has_account:true,deleted_at:new Date()})
 if(active||guest) await db('customer').insert({id:'current_'+seq,email,has_account:!guest})
 if(otherProvider) await db('provider_identity').insert({id:'oauth_'+seq,auth_identity_id:id,provider:'google',entity_id:email})
 const req={params:{auth_provider:'emailpass'},body:{email,password:'new-password'},scope:{resolve:()=>db}}
 return {id,req,read:async()=> (await db('auth_identity').where({id}).first()).app_metadata}
}
test('deleted customer can re-register; repeated and concurrent cleanup are harmless',async()=>{
 const f=await fixture()
 await Promise.all([releaseDeletedCustomerIdentity(f.req),releaseDeletedCustomerIdentity(f.req)])
 assert.deepEqual(await f.read(),{})
 await releaseDeletedCustomerIdentity(f.req)
 assert.deepEqual(await f.read(),{})
})
for(const [name,options] of Object.entries({
 'live customer with same email':{active:true},
 'admin identity':{metadata:{customer_id:null,user_id:'user_admin'}},
 'custom actor metadata':{metadata:{customer_id:null,vendor_id:'vendor_1'}},
 'identity linked to another provider':{otherProvider:true},
})) test(`does not release ${name}`,async()=>{
 const f=await fixture(options),before=await f.read()
 await releaseDeletedCustomerIdentity(f.req)
 assert.deepEqual(await f.read(),before)
})
test('guest customer does not block a previously deleted registered account',async()=>{
 const f=await fixture({guest:true})
 await releaseDeletedCustomerIdentity(f.req)
 assert.deepEqual(await f.read(),{})
})
test('other provider and missing password do not mutate identity',async()=>{
 const f=await fixture()
 f.req.params.auth_provider='google'
 await releaseDeletedCustomerIdentity(f.req)
 assert.deepEqual(await f.read(),{customer_id:null})
 f.req.params.auth_provider='emailpass';delete f.req.body.password
 await releaseDeletedCustomerIdentity(f.req)
 assert.deepEqual(await f.read(),{customer_id:null})
})

for (const kind of ['null orphan', 'missing customer', 'deleted customer', 'upper-case email']) test(`verified owner reclaims ${kind}`, async()=>{
 const f=await fixture({deleted:kind==='deleted customer'})
 if(kind!=='null orphan') await db('auth_identity').where({id:f.id}).update({app_metadata:{customer_id:kind==='deleted customer'?'deleted_'+seq:'missing_customer'}})
 if(kind==='upper-case email') await db('provider_identity').where({auth_identity_id:f.id}).update({entity_id:f.req.body.email.toUpperCase()})
 await releaseDeletedCustomerIdentity(f.req)
 assert.deepEqual(await f.read(),{})
 assert.equal((await db('provider_identity').where({auth_identity_id:f.id}).first()).entity_id,f.req.body.email)
})
test('a live linked customer with a different email is never detached',async()=>{
 const f=await fixture({metadata:{customer_id:'live_other_email'}})
 await db('customer').insert({id:'live_other_email',email:'other@example.test',has_account:true})
 await releaseDeletedCustomerIdentity(f.req)
 assert.deepEqual(await f.read(),{customer_id:'live_other_email'})
})

test('Medusa emailpass rejects stale identity before cleanup and accepts registration after it',async()=>{
 const {EmailPassAuthService}=require('@medusajs/auth-emailpass/dist/services/emailpass')
 const auth=new EmailPassAuthService({logger:console},{hashConfig:{logN:10,r:8,p:1}})
 const f=await fixture({metadata:{customer_id:'deleted_link'},deleted:false})
 let storedHash
 const service={retrieve:async()=>({id:f.id,app_metadata:await f.read(),provider_identities:[{provider:'emailpass',provider_metadata:{}}]}),update:async(email,data)=>{assert.equal(email,f.req.body.email);storedHash=data.provider_metadata.password;return service.retrieve()}}
 assert.equal((await auth.register({body:f.req.body},service)).success,false)
 await releaseDeletedCustomerIdentity(f.req)
 assert.equal((await auth.register({body:f.req.body},service)).success,true)
 assert.equal(typeof storedHash,'string');assert.notEqual(storedHash,f.req.body.password)
})
