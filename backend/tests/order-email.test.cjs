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
 assert.match(mail.html,/<table/);assert.ok(mail.html.includes('2.700'));assert.ok(mail.html.includes('lang="en"'))
 assert.match(orderMessage({...order,currency_code:'eur',total:19.95}).text,/19,95/)
 assert.throws(()=>orderMessage({...order,total:undefined}),/missing amount/)
 assert.throws(()=>orderMessage({...order,items:[]}),/incomplete/)
})
test('order placed handler sends guests once and leaves SMTP failures retryable with sanitized errors',async()=>{
 const original=nodemailer.createTransport,env={SMTP_USER:process.env.SMTP_USER,SMTP_PASSWORD:process.env.SMTP_PASSWORD}
 process.env.SMTP_USER='sender@example.test';process.env.SMTP_PASSWORD='fake'
 let sent=[],closed=0,fail=false,reject=false
 nodemailer.createTransport=()=>({sendMail:async mail=>{if(fail)throw Error('secret-password customer@example.test');if(reject)return {accepted:[]};sent.push(mail);return {accepted:['customer@example.test']}},close:()=>closed++})
 let row={...order,metadata:{keep:true},is_draft_order:false,status:'pending'},queries=0,payload=order
 const trx=table=>{assert.equal(table,'order');return {where(where){assert.equal(where.id,order.id);return this},whereNull(){return this},forUpdate(){return this},first:async()=>row,update:async data=>Object.assign(row,data)}}
 const container={resolve:key=>key===Keys.PG_CONNECTION?{transaction:fn=>fn(trx)}:{graph:async (args,options)=>{queries++;assert.equal(options.cache.enable,false);assert.equal(args.entity,'order');assert.deepEqual(args.filters,{id:order.id});for(const field of ['*items.detail','*items.tax_lines','*items.adjustments','*shipping_methods','*shipping_methods.tax_lines','*shipping_methods.adjustments','*credit_lines'])assert.ok(args.fields.includes(field),field);return {data:[payload]}}}}
 const run=()=>subscriber({event:{data:{id:order.id}},container})
 try{
  assert.equal(config.event,'order.placed')
  await run();await run();assert.equal(sent.length,1);assert.equal(queries,1)
  assert.equal(sent[0].to.address,order.email);assert.equal(sent[0].messageId,'<order-confirmation.order_test@tamir.rs>')
  assert.equal(sent[0].disableFileAccess,true);assert.equal(sent[0].disableUrlAccess,true);assert.equal(row.metadata.keep,true)
  row.metadata={};fail=true;await assert.rejects(run(),e=>!/secret-password|customer@example/.test(e.message));assert.equal(row.metadata.tamir_order_email_sent_at,undefined)
  fail=false;reject=true;await assert.rejects(run(),/not accepted/);assert.equal(row.metadata.tamir_order_email_sent_at,undefined)
  reject=false;await run();assert.equal(sent.length,2);assert.equal(closed,4)
  row.metadata={};payload={...order,items:[{...order.items[0],quantity:undefined}]}
  await assert.rejects(run(),/invalid quantity/);assert.equal(sent.length,2);assert.equal(row.metadata.tamir_order_email_sent_at,undefined)
  payload=order
  for(const patch of [{is_draft_order:true},{no_notification:true},{status:'canceled'},{email:null}]){row={...order,metadata:{},...patch};await run()}
  assert.equal(sent.length,2)
 }finally{nodemailer.createTransport=original;for(const [key,value]of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})

test('multiple lines keep their own quantities and totals in HTML and text, with unit and line counts',()=>{
 const receipt={...order,total:7500,items:[
  {title:'Muška zimska kapa u plavoj boji',variant_title:'One Size / Blue',quantity:2,unit_price:1440,total:2880},
  {title:'Muška zimska kapa u sivoj boji',variant_title:'One Size / Gray',quantity:3,unit_price:1440,total:4320},
 ]}
 const mail=orderMessage(receipt)
 for(const part of [mail.text,mail.html])for(const expected of ['Lines: 2','Units: 5','1.440','2.880','4.320','7.500','300','One Size / Blue','One Size / Gray'])assert.ok(part.includes(expected),expected)
 assert.match(mail.text,/Quantity: 2 ×/);assert.match(mail.text,/Quantity: 3 ×/)
 assert.match(mail.html,/>2<\/strong>/);assert.match(mail.html,/>3<\/strong>/)
 assert.ok(!/undefined|NaN/.test(mail.html+mail.text))
})
test('missing, zero, fractional or non-finite quantities fail before a misleading receipt can be sent',()=>{
 for(const quantity of [undefined,null,0,-1,1.5,NaN,Infinity,'2'])assert.throws(()=>orderMessage({...order,items:[{...order.items[0],quantity}]}),/invalid quantity/)
 for(const value of [undefined,null,NaN,Infinity,'',false]){
  assert.throws(()=>orderMessage({...order,total:value}),/missing amount/)
  assert.throws(()=>orderMessage({...order,items:[{...order.items[0],total:value}]}),/missing amount/)
 }
 // A real zero-price/fully discounted order is valid; missing input must not become zero.
 assert.match(orderMessage({...order,total:0,shipping_total:0,items:[{...order.items[0],unit_price:0,total:0}]}).text,/0,00/)
})
test('HTML escapes product content and preserves authoritative discounted amounts without remote resources',()=>{
 const mail=orderMessage({...order,items:[{...order.items[0],title:'<img src=x onerror="bad()"> & Kapa',variant_title:"<script>bad()</script> 'M'"}]})
 assert.ok(mail.text.includes('<img src=x'))
 assert.ok(mail.html.includes('&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; Kapa'))
 assert.ok(mail.html.includes('&lt;script&gt;'))
 assert.ok(!/<img|<script|<iframe|<link\b/i.test(mail.html))
 assert.ok(mail.html.includes('2.700'));assert.ok(mail.html.includes('max-width:640px'));assert.ok(mail.html.includes('name="viewport"'))
})
