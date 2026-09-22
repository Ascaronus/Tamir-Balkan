import test from 'node:test'
import assert from 'node:assert/strict'
import {load} from '../test-support/component-harness.mjs'
for(const failure of [null,'rate','captcha','cleanup']) test(`registration cleanup ordering, failure=${failure}`,async()=>{
 const calls=[]
 const step=name=>async()=>{calls.push(name);if(failure===name)throw Error(name)}
 const middleware=load('backend/src/api/middlewares.ts',{
  '@medusajs/framework/http':{defineMiddlewares:x=>x,authenticate:()=>()=>{}},
  '../utils/captcha':{verifyCaptcha:step('captcha')},
  '../utils/deleted-customer-registration':{releaseDeletedCustomerIdentity:step('cleanup')},
  '../utils/review-http':{rateLimit:step('rate'),reviewFailure:()=>calls.push('rejected')}
 }).default.routes[0].middlewares[0]
 const req={body:{captcha_token:'token'}}
 await middleware(req,{},()=>calls.push('next'))
 const expected=['rate','captcha','cleanup','next']
 if(failure) expected.splice(expected.indexOf(failure)+1,4,'rejected')
 assert.deepEqual(calls,expected)
 if(!failure) assert.equal(req.body.captcha_token,undefined)
})
