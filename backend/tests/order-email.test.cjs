const {test}=require('node:test')
const assert=require('node:assert/strict')
require('ts-node/register/transpile-only')
const nodemailer=require('nodemailer').default
const {orderMessage}=require('../src/utils/order-email')
const {default:subscriber,config}=require('../src/subscribers/order-confirmation')
const {ContainerRegistrationKeys:Keys}=require('@medusajs/framework/utils')
const order={id:'order_test',display_id:42,email:'customer@example.test',currency_code:'rsd',total:3000,shipping_total:300,items:[{title:'Crni šešir',variant_title:'M / Black',quantity:2,unit_price:1500,total:2700}]}
test('receipt includes order number, variants, quantities and calculated discounted totals in major units',()=>{
 const mail=orderMessage(order)
 assert.match(mail.subject,/#42/)
 for(const text of ['porudžbinu #42','your order #42','Crni šešir — M / Black','Quantity: 2 ×','1.500','2.700','3.000','300','RSD','not receipt of payment'])assert.ok(mail.text.includes(text),text)
 assert.equal(mail.html,undefined)
 assert.match(orderMessage({...order,currency_code:'eur',total:19.95}).text,/19,95/)
 assert.throws(()=>orderMessage({...order,total:undefined}),/missing amount/)
 assert.throws(()=>orderMessage({...order,items:[]}),/incomplete/)
})
test('order placed handler sends guests once and leaves SMTP failures retryable with sanitized errors',async()=>{
 const original=nodemailer.createTransport,env={SMTP_USER:process.env.SMTP_USER,SMTP_PASSWORD:process.env.SMTP_PASSWORD}
 process.env.SMTP_USER='sender@example.test';process.env.SMTP_PASSWORD='fake'
 let sent=[],closed=0,fail=false,reject=false
 nodemailer.createTransport=()=>({sendMail:async mail=>{if(fail)throw Error('secret-password customer@example.test');if(reject)return {accepted:[]};sent.push(mail);return {accepted:['customer@example.test']}},close:()=>closed++})
 let row={...order,metadata:{keep:true},is_draft_order:false,status:'pending'},queries=0
 const trx=table=>{assert.equal(table,'order');return {where(where){assert.equal(where.id,order.id);return this},whereNull(){return this},forUpdate(){return this},first:async()=>row,update:async data=>Object.assign(row,data)}}
 const container={resolve:key=>key===Keys.PG_CONNECTION?{transaction:fn=>fn(trx)}:{graph:async args=>{queries++;assert.equal(args.entity,'order');assert.deepEqual(args.filters,{id:order.id});return {data:[order]}}}}
 const run=()=>subscriber({event:{data:{id:order.id}},container})
 try{
  assert.equal(config.event,'order.placed')
  await run();await run();assert.equal(sent.length,1);assert.equal(queries,1)
  assert.equal(sent[0].to.address,order.email);assert.equal(sent[0].messageId,'<order-confirmation.order_test@tamir.rs>')
  assert.equal(sent[0].disableFileAccess,true);assert.equal(sent[0].disableUrlAccess,true);assert.equal(row.metadata.keep,true)
  row.metadata={};fail=true;await assert.rejects(run(),e=>!/secret-password|customer@example/.test(e.message));assert.equal(row.metadata.tamir_order_email_sent_at,undefined)
  fail=false;reject=true;await assert.rejects(run(),/not accepted/);assert.equal(row.metadata.tamir_order_email_sent_at,undefined)
  reject=false;await run();assert.equal(sent.length,2);assert.equal(closed,4)
  for(const patch of [{is_draft_order:true},{no_notification:true},{status:'canceled'},{email:null}]){row={...order,metadata:{},...patch};await run()}
  assert.equal(sent.length,2)
 }finally{nodemailer.createTransport=original;for(const [key,value]of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})
