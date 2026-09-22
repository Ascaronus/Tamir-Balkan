import test from 'node:test'
import assert from 'node:assert/strict'
import { load, hooks, find } from '../test-support/component-harness.mjs'
import { completeRegistration } from '../src/lib/auth/registration-flow.ts'
const validation = load('backend/src/utils/review-validation.ts')
const rating = load('frontend/src/lib/reviews/rating.ts')

test('fractional rating uses the same rounded number and exact fractional star fill', () => {
 assert.equal(rating.displayRating(4.666666), 4.7)
 assert.equal(rating.starFill(4.5, 4), 50)
 assert.ok(Math.abs(rating.starFill(4.666666, 4)-70)<0.001)
 assert.equal(rating.starFill(4, 4), 0)
 assert.equal(rating.starFill(5, 4), 100)
 assert.equal(rating.displayRating(NaN), 0)
 assert.equal(rating.reviewCollapsed(-1), true)
 assert.equal(rating.reviewCollapsed(0), false)
})
test('review requires text, name, rating and enforces Unicode length without using email', () => {
 const good={name:'Igor',body:'Good',rating:5}
 for(const patch of [{body:''},{body:'   '},{body:'a'.repeat(251)},{rating:0},{rating:6},{rating:'5'},{rating:NaN},{rating:4.7},{name:'me@example.com'},{name:''}]) {
  assert.throws(()=>validation.reviewInput({...good,...patch}))
 }
 assert.equal(validation.reviewInput({...good,body:'🙂'.repeat(250)}).body.length,500)
 assert.equal(validation.reviewInput({...good,rating:4.5}).rating,4.5)
})
test('public projection strips email, customer ID and all private fields', () => {
 const item=validation.publicReview({id:'r',name:'Igor',body:'Nice',rating:'4.5',score:'-1',up:'2',down:'3',created_at:'2026-01-01',email:'private',customer_id:'secret',author_email:'private',phone:'private',metadata:{secret:1}})
 assert.deepEqual(Object.keys(item).sort(),['id','name','body','rating','score','up','down','created_at','voted'].sort())
 assert.equal(item.score,-1);assert.equal(item.rating,4.5)
 assert.ok(!JSON.stringify(item).includes('private'))
})
test('only the final designated admin email passes the moderator predicate', () => {
 assert.equal(validation.isReviewModerator({email:'Admin@tamir.local'}),true)
 assert.equal(validation.isReviewModerator({email:'vicommsk@gmail.com'}),false)
 assert.equal(validation.isReviewModerator(null),false)
})
test('only one of positive or negative reaction is a valid request value', () => {
 for(const value of [0,2,-2,'1',null,{},[1,-1]]) assert.throws(()=>validation.voteInput(value))
 assert.equal(validation.voteInput(1),1);assert.equal(validation.voteInput(-1),-1)
})
function captcha(env = {}) {
 return load('backend/src/utils/captcha.ts',{'./review-validation':validation},{process:{env:{TURNSTILE_SECRET_KEY:'test-secret',TURNSTILE_HOSTNAMES:'tamir.rs',...env}},fetch:async()=>{throw Error('Unexpected request')}})
}
test('CAPTCHA rejects missing configuration and tokens without contacting the provider',async()=>{
 await assert.rejects(captcha({TURNSTILE_SECRET_KEY:''}).verifyCaptcha('x','review'),e=>e.code==='CAPTCHA_UNAVAILABLE')
 for(const token of ['',undefined,'x'.repeat(2049)]) await assert.rejects(captcha().verifyCaptcha(token,'review'),e=>e.code==='CAPTCHA_REQUIRED')
})
test('CAPTCHA checks success, hostname and action and rejects replay/failure', async () => {
 for(const response of [{success:false},{success:true,hostname:'evil.test',action:'review'},{success:true,hostname:'tamir.rs',action:'register'}]) {
  await assert.rejects(captcha().verifyCaptcha('token','review',async()=>({ok:true,json:async()=>response})),e=>e.code==='CAPTCHA_FAILED')
 }
 let options
 await captcha().verifyCaptcha('token','review',async(url,opts)=>{options=opts;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');return {ok:true,json:async()=>({success:true,hostname:'tamir.rs',action:'review'})}})
 assert.equal(options.body.get('response'),'token')
 assert.equal(options.body.get('secret'),'test-secret')
 await assert.rejects(captcha().verifyCaptcha('token','review',async()=>{throw Error('offline')}),e=>e.code==='CAPTCHA_UNAVAILABLE')
})
test('CAPTCHA errors cannot bypass registration through partial-account recovery', async()=>{
 for(const code of ['CAPTCHA_FAILED','CAPTCHA_UNAVAILABLE','TOO_MANY_REQUESTS']) {
  let logins=0
  await assert.rejects(completeRegistration({register:async()=>{throw Error(code)},login:async()=>{logins++;return 'token'}}),new RegExp(code))
  assert.equal(logins,0)
 }
})
function ui(customer = null, response = {reviews:[],count:0,rating:0,has_review:false}, hash = '') {
 const h=hooks();let calls=0,posted=0,captchaCalls=0
 const component=load('frontend/src/components/reviews/ProductReviews.tsx',{
  react:h.react,'next/link':'Link',
  '@/components/auth/AuthProvider':{useAuth:()=>({customer,isReady:true})},
  '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'en',t:(key,args)=>key+(args?JSON.stringify(args):'')})},
  '@/components/security/Captcha':{useCaptcha:()=>({requestCaptcha:async()=>{captchaCalls++;return 'challenge-token'},captcha:null})},
  '@/lib/reviews/client':{listReviews:async()=>{calls++;return response},reviewRequest:async()=>{posted++},reviewErrorKey:()=> 'reviews.failed'},
  '@/lib/reviews/rating':rating,'./Stars':{Stars:'Stars',ReviewIcon:'ReviewIcon',Thumb:'Thumb'},
 },{window:{location:{hash},addEventListener(){},removeEventListener(){}},document:{getElementById:()=>null}})
 return {h,render:()=>h.render(()=>component.ProductReviews({productId:'prod_1',initial:{rating:4.5,count:2}})),get calls(){return calls},get posted(){return posted},get captchaCalls(){return captchaCalls}}
}
test('review section starts collapsed and a guest can expand only reading',async()=>{
 const a=ui();let tree=a.render();await a.h.flush();tree=a.render()
 assert.equal(find(tree,n=>n.type==='form'),null)
 assert.equal(find(tree,n=>n.props?.id==='product-review-content'),null)
 assert.equal(a.calls,0)
 find(tree,n=>n.type==='button'&&n.props['aria-controls']).props.onClick()
 a.render();await a.h.flush();tree=a.render()
 assert.ok(find(tree,n=>n.props?.id==='product-review-content'))
 assert.equal(find(tree,n=>n.type==='form'),null)
 assert.ok(JSON.stringify(tree).includes('reviews.signIn'))
})
test('catalog review anchor opens the section; existing reviewer has no second form',async()=>{
 const a=ui({id:'c',first_name:'Igor'},{reviews:[],count:1,rating:5,has_review:true},'#reviews')
 a.render();await a.h.flush();a.render();await a.h.flush();const tree=a.render()
 assert.ok(find(tree,n=>n.props?.id==='product-review-content'))
 assert.ok(JSON.stringify(tree).includes('reviews.alreadyReviewed'))
 assert.equal(find(tree,n=>n.type==='form'),null)
})
test('negative review text is collapsed, manually revealable; guest reaction buttons disabled',async()=>{
 const review={id:'r',name:'Igor',body:'Review text',rating:5,score:-1,up:0,down:1,created_at:'2026-09-21',voted:false}
 const a=ui(null,{reviews:[review],count:1,rating:5,has_review:false},'#reviews')
 a.render();await a.h.flush();a.render();await a.h.flush();const tree=a.render()
 const item=find(tree,n=>typeof n.type==='function'&&n.props?.review)
 const child=hooks();Object.assign(a.h.react,child.react)
 let card=child.render(()=>item.type(item.props))
 assert.equal(find(card,n=>n.type==='p'&&n.props.children==='Review text'),null)
 assert.ok(find(card,n=>n.type==='button'&&n.props['aria-label']==='reviews.helpful').props.disabled)
 find(card,n=>n.type==='button'&&n.props['aria-expanded']===false).props.onClick()
 card=child.render(()=>item.type(item.props))
 assert.ok(find(card,n=>n.type==='p'&&n.props.children==='Review text'))
})
