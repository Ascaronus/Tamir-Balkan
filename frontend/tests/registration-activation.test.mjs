import test from 'node:test'
import assert from 'node:assert/strict'
import {load} from '../test-support/component-harness.mjs'
function setup(existing=null,authenticated=true) {
 const calls=[]
 const service={register:async()=>{calls.push('register');return {success:true,authIdentity:{id:'auth_new'}}},authenticate:async()=>({success:authenticated,authIdentity:{app_metadata:{customer_id:existing?.id}}})}
 const db=()=>({whereRaw(){return this},where(){return this},whereNull(){return this},first:async()=>existing})
 const module=load('backend/src/utils/activate-registration.ts',{
  '@medusajs/framework/utils':{Modules:{AUTH:'auth'}},
  '@medusajs/medusa/core-flows':{createCustomerAccountWorkflow:()=>({run:async input=>{calls.push(input);return {result:{id:'new_customer'}}}})},
  './deleted-customer-registration':{releaseDeletedCustomerIdentity:async()=>calls.push('release-deleted')},
  './review-http':{reviewDb:()=>db},
  './review-validation':{ReviewError:class extends Error{constructor(status,code){super(code);this.code=code}}}
 })
 const req={params:{},body:{},scope:{resolve:()=>service}}
 const profile={password:'test-password',first_name:'Igor',last_name:'Test',phone:'+381123',postal_code:'21000',city:'Novi Sad',notes:''}
 return {...module,calls,run:(previous=null)=>module.activateRegistration(req,'test@example.test','challenge',profile,previous)}
}
test('verified registration creates a new account with address and verification record',async()=>{
 const s=setup();assert.equal(await s.run(),'new_customer')
 assert.equal(s.calls[0],'release-deleted');assert.equal(s.calls[1],'register')
 const input=s.calls[2].input
 assert.equal(input.authIdentityId,'auth_new')
 assert.equal(input.customerData.metadata.registration_challenge,'challenge')
 assert.ok(input.customerData.metadata.email_verified_at)
 assert.equal(input.customerData.addresses[0].postal_code,'21000')
 assert.equal(input.customerData.password,undefined)
})
test('existing active account is never reset or registered again',async()=>{
 const s=setup({id:'existing',metadata:{}})
 await assert.rejects(s.run(),/ACCOUNT_EXISTS/);assert.deepEqual(s.calls,[])
})
test('lost successful response can be retried only for the same challenge and password',async()=>{
 const s=setup({id:'existing',metadata:{registration_challenge:'challenge'}})
 assert.equal(await s.run(),'existing');assert.deepEqual(s.calls,[])
 const wrong=setup({id:'existing',metadata:{registration_challenge:'challenge'}},false)
 await assert.rejects(wrong.run(),/ACCOUNT_EXISTS/);assert.deepEqual(wrong.calls,[])
})
