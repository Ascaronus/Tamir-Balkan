// Isolated PostgreSQL only; never uses the application's DATABASE_URL.
const {test,before,after}=require('node:test')
const assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
require('ts-node/register/transpile-only')
// resolve by the framework's own key constants — never hardcode the (underscored) string value
const {ContainerRegistrationKeys}=require('@medusajs/framework/utils')
const {loginRateSchema,loginRateLimit,clientIp,LOGIN_EMAIL_FAIL_LIMIT,LOGIN_IP_FAIL_LIMIT}=require('../src/utils/login-rate-limit')
const connection=process.env.TEST_REVIEWS_DB_URL
if(!connection)throw Error('Set TEST_REVIEWS_DB_URL to an isolated test database')
const SECRET='test-only-login-rate-limit-secret-at-least-32-chars'
process.env.REVIEW_RATE_SECRET=SECRET
const warns=[]
const fakeLogger={warn:m=>warns.push(String(m)),info(){},debug(){}}
const knex=require('knex'),schema='tamir_login_test_'+process.pid
const root=knex({client:'pg',connection}),db=knex({client:'pg',connection,searchPath:[schema],pool:{min:0,max:8}})
before(async()=>{await root.raw(`CREATE SCHEMA ${schema}`);await db.raw(loginRateSchema)})
after(async()=>{await db.destroy();await root.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.destroy()})
const sleep=(ms=5)=>new Promise(r=>setTimeout(r,ms))
function fakeReq({peer='203.0.113.7',xff,email='buyer@example.test'}={}){
 return {
  body:email===undefined?undefined:{email},
  headers:xff===undefined?{}:{'x-forwarded-for':xff},
  socket:{remoteAddress:peer},
  scope:{resolve:key=>key===ContainerRegistrationKeys.PG_CONNECTION?db:key===ContainerRegistrationKeys.LOGGER?fakeLogger:undefined},
 }
}
function fakeRes(){
 const res=new EventEmitter()
 res.statusCode=200;res.body=null
 res.status=s=>{res.statusCode=s;return res}
 res.json=b=>{res.body=b;return res}
 return res
}
// loginRateLimit is fire-and-forget: it later either calls next() (request proceeds to auth)
// or answers 429 itself. settle() waits for whichever happens first.
function runMiddleware(req,res){
 let nextCalled=false
 loginRateLimit(req,res,()=>{nextCalled=true})
 return {nextCalled:()=>nextCalled,settled:()=>res.body!==null}
}
async function settle(mw){
 for(let i=0;i<400;i++){if(mw.nextCalled()||mw.settled())return;await sleep(5)}
 throw Error('the middleware neither continued the request nor answered within 2s')
}
async function attempt(req,finishStatus){
 const res=fakeRes()
 const mw=runMiddleware(req,res)
 await settle(mw)
 assert.ok(mw.nextCalled(),'the request must reach authentication')
 assert.equal(res.body,null,'the middleware must not answer before authentication runs')
 assert.equal(warns.length,0,'the throttle must never degrade to fail open: '+warns.join('; '))
 if(finishStatus!==undefined){res.statusCode=finishStatus;res.emit('finish')}
 return res
}
async function blocked(req){
 const res=fakeRes()
 const mw=runMiddleware(req,res)
 await settle(mw)
 assert.ok(mw.settled()&&!mw.nextCalled(),'a blocked request must be answered by the middleware alone')
 assert.equal(res.statusCode,429)
 assert.equal(res.body.code,'TOO_MANY_REQUESTS')
 assert.equal(res.body.message,'TOO_MANY_REQUESTS')
 assert.ok(Number(res.body.retry_after)>=1&&Number(res.body.retry_after)<=3600)
 assert.equal(res.listenerCount('finish'),0,'blocked requests must never attach the finish listener')
 return res
}
async function rowCount(key){
 const {rows}=await db.raw('SELECT count FROM tamir_login_rate WHERE key = ?',[key])
 return rows.length?Number(rows[0].count):null
}
async function waitCount(key,expected){
 for(let i=0;i<1500;i++){if(await rowCount(key)===expected)return true;await sleep(10)}
 return false
}
const emailKey=(email,ip)=>`login-email:${require('node:crypto').createHmac('sha256',SECRET).update(`${email}|${ip}`).digest('hex')}`
const ipKey=ip=>`login-ip:${require('node:crypto').createHmac('sha256',SECRET).update(ip).digest('hex')}`

test('five failed attempts block the email+IP pair on the sixth',async()=>{
 const peer='198.51.100.1',email='five-strikes@example.test'
 for(let i=1;i<=LOGIN_EMAIL_FAIL_LIMIT;i++){
  await attempt(fakeReq({peer,email}),401)
  assert.ok(await waitCount(emailKey(email,peer),i),`failure #${i} must be counted`)
  assert.ok(await waitCount(ipKey(peer),i))
 }
 await blocked(fakeReq({peer,email}))
})
test('blocked requests are not counted again and do not exhaust a different email from the same IP',async()=>{
 const peer='198.51.100.2',email='blocked-count@example.test'
 for(let i=0;i<LOGIN_EMAIL_FAIL_LIMIT;i++)await attempt(fakeReq({peer,email}),400)
 assert.ok(await waitCount(emailKey(email,peer),LOGIN_EMAIL_FAIL_LIMIT))
 for(let i=0;i<3;i++)await blocked(fakeReq({peer,email}))
 assert.equal(await rowCount(emailKey(email,peer)),LOGIN_EMAIL_FAIL_LIMIT,'429 responses must not inflate the count')
 const other='second-email@example.test'
 await attempt(fakeReq({peer,email:other}),401)
 assert.ok(await waitCount(emailKey(other,peer),1),'a different email from a partially used IP keeps its own quota')
})
test('30 failed attempts across different emails block the IP itself',async()=>{
 const peer='198.51.100.3'
 for(let i=1;i<=LOGIN_IP_FAIL_LIMIT;i++)await attempt(fakeReq({peer,email:`person${i}@example.test`}),401)
 assert.ok(await waitCount(ipKey(peer),LOGIN_IP_FAIL_LIMIT))
 await blocked(fakeReq({peer,email:'person-new@example.test'}))
})
test('successful sign-ins are never counted',async()=>{
 const peer='198.51.100.4',email='winner@example.test'
 for(let i=0;i<8;i++)await attempt(fakeReq({peer,email}),200)
 await sleep(50)
 assert.equal(await rowCount(emailKey(email,peer)),null)
 assert.equal(await rowCount(ipKey(peer)),null)
})
test('expired counters reset instead of blocking forever',async()=>{
 const peer='198.51.100.5',email='expired@example.test'
 const key=emailKey(email,peer)
 await db.raw('INSERT INTO tamir_login_rate (key,count,expires_at) VALUES (?,?,(now() - interval \'1 minute\'))',[key,99])
 await attempt(fakeReq({peer,email}),401)
 assert.ok(await waitCount(key,1),'an expired counter restarts at 1')
})
test('client IP comes from the nginx-appended XFF entry behind loopback, and forged XFF is ignored from a public peer',()=>{
 assert.equal(clientIp({socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'9.9.9.9, 192.0.2.7'}}),'192.0.2.7')
 assert.equal(clientIp({socket:{remoteAddress:'::ffff:127.0.0.1'},headers:{'x-forwarded-for':'192.0.2.8'}}),'192.0.2.8')
 assert.equal(clientIp({socket:{remoteAddress:'127.0.0.1'},headers:{}}),'127.0.0.1')
 assert.equal(clientIp({socket:{remoteAddress:'203.0.113.9'},headers:{'x-forwarded-for':'9.9.9.9'}}),'203.0.113.9')
})
test('forged XFF cannot buy a fresh quota from a public peer',async()=>{
 const peer='198.51.100.6',email='forge@example.test'
 for(let i=0;i<LOGIN_EMAIL_FAIL_LIMIT;i++)await attempt(fakeReq({peer,xff:`9.9.9.${i+1}`,email}),401)
 assert.ok(await waitCount(ipKey(peer),LOGIN_EMAIL_FAIL_LIMIT))
 assert.equal(await rowCount(ipKey('9.9.9.1')),null,'the forged header must never become the throttle key')
 await blocked(fakeReq({peer,xff:'9.9.9.99',email}))
})
test('missing or malformed email still throttles by IP',async()=>{
 const peer='198.51.100.7'
 await attempt(fakeReq({peer,email:''}),401)
 assert.ok(await waitCount(ipKey(peer),1),'a blank email must still count against the IP')
 for(let i=1;i<LOGIN_IP_FAIL_LIMIT;i++){const r=fakeReq({peer});delete r.body;await attempt(r,401)}
 assert.ok(await waitCount(ipKey(peer),LOGIN_IP_FAIL_LIMIT))
 await blocked(fakeReq({peer,email:`unrelated${LOGIN_EMAIL_FAIL_LIMIT}@example.test`}))
})
test('schema setup is idempotent',async()=>{
 await db.raw(loginRateSchema)
 await db.raw(loginRateSchema)
})
test('the throttle fails open when its secret or database is unavailable',async()=>{
 const original=process.env.REVIEW_RATE_SECRET
 try{
  process.env.REVIEW_RATE_SECRET='short'
  const first=runMiddleware(fakeReq(),fakeRes())
  await settle(first)
  assert.ok(first.nextCalled(),'a broken secret must never block sign-in')
  const req=fakeReq()
  req.scope.resolve=()=>{throw Error('db down')}
  const second=runMiddleware(req,fakeRes())
  await settle(second)
  assert.ok(second.nextCalled(),'a database outage must never block sign-in')
 }finally{process.env.REVIEW_RATE_SECRET=original}
})
