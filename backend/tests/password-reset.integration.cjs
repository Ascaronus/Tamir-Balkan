// Isolated PostgreSQL only; never uses the application's DATABASE_URL or SMTP.
const {test,before,after}=require('node:test')
const assert=require('node:assert/strict')
require('ts-node/register/transpile-only')
const {passwordResetSchema,issuePasswordReset,confirmPasswordReset,validateNewPassword}=require('../src/utils/password-reset')
const {EmailPassAuthService}=require('@medusajs/auth-emailpass/dist/services/emailpass')
const connection=process.env.TEST_REVIEWS_DB_URL
if(!connection)throw Error('Set TEST_REVIEWS_DB_URL to an isolated test database')
process.env.REVIEW_RATE_SECRET='test-only-password-reset-secret-at-least-32-chars'
const knex=require('knex'),schema='tamir_reset_test_'+process.pid
const root=knex({client:'pg',connection}),db=knex({client:'pg',connection,searchPath:[schema],pool:{min:0,max:8}})
const auth=new EmailPassAuthService({logger:console},{hashConfig:{logN:10,r:8,p:1}})
before(async()=>{await root.raw(`CREATE SCHEMA ${schema}`);await db.raw(passwordResetSchema);await db.raw(`
CREATE TABLE auth_identity (id text PRIMARY KEY, app_metadata jsonb, deleted_at timestamptz);
CREATE TABLE provider_identity (id text PRIMARY KEY, auth_identity_id text, provider text, entity_id text, provider_metadata jsonb, deleted_at timestamptz);
CREATE TABLE customer (id text PRIMARY KEY, email text, has_account boolean, deleted_at timestamptz);`)})
after(async()=>{await db.destroy();await root.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.destroy()})
let serial=0
async function fixture(kind='active'){
 const n=++serial,email=`person${n}@example.test`,aid='auth_'+n,cid='cus_'+n
 if(kind!=='unknown'){
  await db('customer').insert({id:cid,email,has_account:kind!=='guest',deleted_at:kind==='deleted'?new Date():null})
  await db('auth_identity').insert({id:aid,app_metadata:{customer_id:cid,...(kind==='admin'?{user_id:'admin'}:{})}})
  await db('provider_identity').insert({id:'pi_'+n,auth_identity_id:aid,provider:'emailpass',entity_id:email,provider_metadata:{password:await auth.hashPassword('old-password')}})
 }
 let code,sends=0
 const send=async c=>{code=c;sends++}
 const challenge=await issuePasswordReset(db,email,send)
 const service={
  retrieve:async({entity_id})=>{const row=await db('provider_identity').where({entity_id}).first();return {id:row.auth_identity_id,provider_identities:[row]}},
  update:async(entity_id,data)=>{await db('provider_identity').where({entity_id}).update(data);return service.retrieve({entity_id})}
 }
 let updates=0
 return {email,aid,cid,...challenge,send,get code(){return code},get sends(){return sends},get updates(){return updates},
  check:(value=code,id=challenge.challenge_id)=>confirmPasswordReset(db,email,id,value,async entity_id=>{updates++;const result=await auth.update({entity_id,password:'new-password'},service);assert.equal(result.success,true)}),
  login:async password=>(await auth.authenticate({body:{email,password}},service)).success}
}
test('real emailpass password changes only after valid code; old password and code no longer work',async()=>{
 const f=await fixture();assert.match(f.code,/^\d{6}$/);assert.equal(await f.login('old-password'),true)
 const row=await db('tamir_password_reset').where({email:f.email}).first()
 assert.notEqual(row.code_hash,f.code);assert.equal(new Date(row.expires_at)-new Date(row.sent_at),600000)
 await assert.rejects(f.check('wrong'),e=>e.code==='CODE_INVALID');assert.equal(f.updates,0)
 await f.check();assert.equal(await f.login('new-password'),true);assert.equal(await f.login('old-password'),false)
 await assert.rejects(f.check(),e=>e.code==='CODE_USED');assert.equal(f.updates,1)
})
test('five guesses lock out the correct code; expires after ten minutes',async()=>{
 const f=await fixture()
 for(let i=0;i<5;i++)await assert.rejects(f.check('bad'),e=>e.code===(i===4?'CODE_ATTEMPTS':'CODE_INVALID'))
 await assert.rejects(f.check(),e=>e.code==='CODE_ATTEMPTS');assert.equal(f.updates,0)
 const expired=await fixture();await db('tamir_password_reset').where({email:expired.email}).update({expires_at:new Date(0)})
 await assert.rejects(expired.check(),e=>e.code==='CODE_EXPIRED')
})
test('resend waits sixty seconds and invalidates previous challenge and code',async()=>{
 const f=await fixture(),oldCode=f.code
 await assert.rejects(issuePasswordReset(db,f.email,f.send),e=>e.code==='CODE_COOLDOWN');assert.equal(f.sends,1)
 await db('tamir_password_reset').where({email:f.email}).update({sent_at:new Date(Date.now()-61000)})
 const next=await issuePasswordReset(db,f.email,f.send);assert.notEqual(oldCode,f.code)
 await assert.rejects(f.check(oldCode),e=>e.code==='CODE_EXPIRED')
 await assert.rejects(f.check(oldCode,next.challenge_id),e=>e.code==='CODE_INVALID')
 await f.check(f.code,next.challenge_id)
})
for(const kind of ['unknown','guest','deleted','admin'])test(`${kind} gets same response without sending a code or changing password`,async()=>{
 const f=await fixture(kind);assert.match(f.challenge_id,/^[a-f0-9]{64}$/);assert.equal(f.retry_after,60);assert.equal(f.sends,0)
 await assert.rejects(f.check('000000'));assert.equal(f.updates,0)
})
test('code cannot be reused for another email or a re-created account',async()=>{
 const f=await fixture();let changed=false
 await assert.rejects(confirmPasswordReset(db,'other@example.test',f.challenge_id,f.code,async()=>{changed=true}),e=>e.code==='CODE_EXPIRED')
 await db('customer').where({id:f.cid}).update({deleted_at:new Date()})
 await assert.rejects(f.check(),e=>e.code==='CODE_EXPIRED');assert.equal(changed,false);assert.equal(f.updates,0)
})
test('changed password version invalidates outstanding code',async()=>{
 const f=await fixture();await db('provider_identity').where({entity_id:f.email}).update({provider_metadata:{password:await auth.hashPassword('externally-changed')}})
 await assert.rejects(f.check(),e=>e.code==='CODE_EXPIRED');assert.equal(f.updates,0)
})
test('concurrent successful confirmations change the password once',async()=>{
 const f=await fixture();const results=await Promise.allSettled([f.check(),f.check()]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.updates,1)
})
test('failed email delivery leaves previous code usable',async()=>{
 const f=await fixture();await db('tamir_password_reset').where({email:f.email}).update({sent_at:new Date(Date.now()-61000)})
 await assert.rejects(issuePasswordReset(db,f.email,async()=>{throw Error('SMTP failed')}));await f.check()
})
test('new password length is validated',()=>{
 for(const password of [null,123,'1234567','x'.repeat(257)])assert.throws(()=>validateNewPassword(password),e=>e.code==='PASSWORD_INVALID')
 assert.equal(validateNewPassword('new-password'),'new-password')
})
