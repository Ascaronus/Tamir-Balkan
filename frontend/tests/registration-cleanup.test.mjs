import test from 'node:test'
import assert from 'node:assert/strict'
import {load} from '../test-support/component-harness.mjs'

test('legacy identity registration and direct customer creation cannot bypass OTP',()=>{
 const routes=load('backend/src/api/middlewares.ts',{'@medusajs/framework/http':{defineMiddlewares:x=>x,authenticate:()=>()=>{}}}).default.routes
 for(const matcher of ['/auth/customer/:provider/register','/store/customers']) {
  let status,body,next=false
  routes.find(r=>r.matcher===matcher&&r.methods.includes('POST')).middlewares[0]({}, {status(s){status=s;return this},json(b){body=b}},()=>{next=true})
  assert.equal(status,403);assert.equal(body.code,'EMAIL_VERIFICATION_REQUIRED');assert.equal(next,false)
 }
})
for(const failure of [null,'captcha']) test(`code cannot be sent before CAPTCHA; failure=${failure}`,async()=>{
 const calls=[]
 const route=load('backend/src/api/store/registration/start/route.ts',{
  '../../../../utils/registration-code':{registrationEmail:()=> 'test@example.test',issueCode:async(_db,_email,send)=>{calls.push('issue');await send('123456');return {challenge_id:'opaque'}}},
  '../../../../utils/captcha':{verifyCaptcha:async()=>{calls.push('captcha');if(failure)throw Error(failure)}},
  '../../../../utils/review-http':{rateLimit:async()=>calls.push('rate'),reviewDb:()=>({}),reviewFailure:()=>calls.push('rejected')},
  '../../../../utils/registration-email':{sendRegistrationCode:async()=>calls.push('mail')},
 })
 await route.POST({body:{email:'test@example.test',captcha_token:'token'}},{setHeader(){},json:()=>calls.push('response')})
 assert.deepEqual(calls,failure?['rate','captcha','rejected']:['rate','captcha','rate','issue','mail','response'])
})
