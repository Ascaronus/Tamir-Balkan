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
 'live linked customer':{metadata:{customer_id:'cus_live'}},
 'live customer with same email':{active:true},
 'admin identity':{metadata:{customer_id:null,user_id:'user_admin'}},
 'custom actor metadata':{metadata:{customer_id:null,vendor_id:'vendor_1'}},
 'unconfirmed deleted status':{deleted:false},
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
