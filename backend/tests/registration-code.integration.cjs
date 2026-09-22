// Requires an isolated PostgreSQL database. Never uses application DATABASE_URL.
const {test,before,after} = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const {registrationSchema,issueCode,confirmCode} = require('../src/utils/registration-code')
const connection=process.env.TEST_REVIEWS_DB_URL
if(!connection) throw Error('Set TEST_REVIEWS_DB_URL to an isolated test database')
process.env.REVIEW_RATE_SECRET='test-only-registration-secret-at-least-32-chars'
const knex=require('knex'),schema='tamir_otp_test_'+process.pid
const root=knex({client:'pg',connection}),db=knex({client:'pg',connection,searchPath:[schema],pool:{min:0,max:8}})
before(async()=>{await root.raw(`CREATE SCHEMA ${schema}`);await db.raw(registrationSchema)})
after(async()=>{await db.destroy();await root.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.destroy()})
let serial=0
async function start(){let code;const email=`test${++serial}@example.test`;const challenge=await issueCode(db,email,async c=>{code=c});return {email,code,...challenge}}
const check=(f,code,activate=async()=> 'customer_created')=>confirmCode(db,f.email,f.challenge_id,code,activate)

test('code has six digits, is hashed at rest, and expires after ten minutes',async()=>{
 const f=await start(),row=await db('tamir_registration_code').where({email:f.email}).first()
 assert.match(f.code,/^\d{6}$/);assert.notEqual(row.code_hash,f.code)
 assert.equal(new Date(row.expires_at)-new Date(row.sent_at),600000)
 assert.equal(f.retry_after,60)
 await db('tamir_registration_code').where({email:f.email}).update({expires_at:new Date(Date.now()-1)})
 await assert.rejects(check(f,f.code),e=>e.code==='CODE_EXPIRED')
})
test('five failed attempts lock the code, including the correct code afterwards',async()=>{
 const f=await start(),wrong=f.code==='000000'?'000001':'000000'
 for(let i=1;i<=5;i++) await assert.rejects(check(f,wrong),e=>e.code===(i===5?'CODE_ATTEMPTS':'CODE_INVALID'))
 await assert.rejects(check(f,f.code),e=>e.code==='CODE_ATTEMPTS')
 assert.equal((await db('tamir_registration_code').where({email:f.email}).first()).attempts,5)
})
test('correct fifth attempt succeeds, and wrong codes never activate',async()=>{
 const f=await start();let activated=0
 for(let i=0;i<4;i++) await assert.rejects(check(f,'bad',async()=>{activated++;return 'bad'}))
 await check(f,f.code,async previous=>{assert.equal(previous,null);activated++;return 'new'})
 assert.equal(activated,1)
})
test('resend enforces cooldown and invalidates old code and challenge',async()=>{
 const f=await start();let sent=0,nextCode
 await assert.rejects(issueCode(db,f.email,async()=>{sent++}),e=>e.code==='CODE_COOLDOWN');assert.equal(sent,0)
 await db('tamir_registration_code').where({email:f.email}).update({sent_at:new Date(Date.now()-61000)})
 const next=await issueCode(db,f.email,async c=>{nextCode=c})
 assert.notEqual(nextCode,f.code)
 await assert.rejects(check(f,f.code),e=>e.code==='CODE_EXPIRED')
 await assert.rejects(check({...f,...next},f.code),e=>e.code==='CODE_INVALID')
 await check({...f,...next},nextCode)
})
test('failed SMTP resend retains the previous code and does not report success',async()=>{
 const f=await start()
 await db('tamir_registration_code').where({email:f.email}).update({sent_at:new Date(Date.now()-61000)})
 await assert.rejects(issueCode(db,f.email,async()=>{throw Error('SMTP failure')}))
 await check(f,f.code)
})
test('concurrent sends deliver only one code; concurrent guesses cannot exceed five attempts',async()=>{
 const email=`test${++serial}@example.test`;let sent=0,code
 const results=await Promise.allSettled([1,2].map(()=>issueCode(db,email,async c=>{sent++;code=c})))
 assert.equal(sent,1)
 const f={email,code,...results.find(r=>r.status==='fulfilled').value}
 const guesses=await Promise.allSettled(Array.from({length:8},()=>check(f,'bad')))
 assert.ok(guesses.every(r=>r.status==='rejected'))
 assert.equal((await db('tamir_registration_code').where({email}).first()).attempts,5)
})
test('concurrent confirmations pass the completed customer to retries; different email fails',async()=>{
 const f=await start();let created=0
 const activate=async previous=>{if(previous)return previous;created++;return 'new_customer'}
 await Promise.all([check(f,f.code,activate),check(f,f.code,activate)])
 assert.equal(created,1)
 await assert.rejects(check({...f,email:'someoneelse@example.test'},f.code),e=>e.code==='CODE_EXPIRED')
})
test('activation failure leaves correct code retryable',async()=>{
 const f=await start()
 await assert.rejects(check(f,f.code,async()=>{throw Error('database unavailable')}))
 await check(f,f.code)
})
