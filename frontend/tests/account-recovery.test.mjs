import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {load,hooks,find} from '../test-support/component-harness.mjs'

test('SDK and UI use one token key, and logout clears legacy token too',()=>{
 const values=new Map([['tb_customer_token','old'],['medusa_auth_token','legacy']])
 const storage=load('frontend/src/lib/auth/auth-storage.ts',{}, {window:{localStorage:{getItem:key=>values.get(key),removeItem:key=>values.delete(key)}}})
 storage.clearAuthToken();assert.equal(values.size,0)
 assert.match(fs.readFileSync(new URL('../src/lib/medusa.ts',import.meta.url),'utf8'),/jwtTokenStorageKey: "tb_customer_token"/)
})
for(const status of [401,404,503])test(`customer lookup ${status} ${status===503?'preserves':'clears'} token`,async()=>{
 let token='old',cleared=0
 const client=load('frontend/src/lib/auth/auth-client.ts',{
  '@/lib/medusa':{sdk:{client:{fetch:async()=>{throw Object.assign(Error('response'),{status})},clearToken:async()=>{cleared++}}}},
  './auth-storage':{getAuthToken:()=>token,clearAuthToken:()=>{token=null}},'@/lib/cart/cart-storage':{}
 })
 if(status===503){await assert.rejects(client.retrieveCustomer());assert.equal(token,'old');assert.equal(cleared,0)}
 else {assert.equal(await client.retrieveCustomer(),null);assert.equal(token,null);assert.equal(cleared,1)}
})
test('password recovery keeps code and passwords out of URLs and does not log in automatically',async()=>{
 const calls=[]
 const client=load('frontend/src/lib/auth/password-reset-client.ts',{'@/lib/medusa':{sdk:{client:{fetch:async(path,options)=>{calls.push({path,options});return {success:true}}}}}})
 await client.requestPasswordReset(' USER@example.test ','captcha')
 await client.resetPassword({email:' USER@example.test ',challenge_id:'opaque',code:'123456',password:'new-password'})
 assert.deepEqual(calls.map(x=>x.path),['/store/password-reset/start','/store/password-reset/verify'])
 assert.equal(calls[1].options.body.email,'user@example.test');assert.equal(calls[1].options.body.password,'new-password')
 assert.ok(calls.every(x=>x.options.method==='POST'&&x.options.cache==='no-store'))
})
test('password reset UI requires matching passwords, shows spam notice and sends once',async()=>{
 const h=hooks();let requests=0,updates=0
 const c=load('frontend/src/components/auth/PasswordResetForm.tsx',{
  react:h.react,'next/link':'Link',
  '@/components/i18n/LocaleProvider':{useTranslations:()=>key=>key},
  '@/components/security/Captcha':{useCaptcha:()=>({requestCaptcha:async()=> 'captcha',captcha:null})},
  '@/lib/reviews/client':{reviewErrorKey:()=> 'captcha-error'},
  '@/lib/auth/password-reset-client':{requestPasswordReset:async()=>{requests++;return {challenge_id:'id',retry_after:60}},resetPassword:async()=>{updates++}}
 },{window:{setInterval:()=>1,clearInterval(){}}})
 const render=()=>h.render(()=>c.PasswordResetForm({countryCode:'rs'}));let tree=render()
 find(tree,n=>n.type==='input').props.onChange({target:{value:'person@example.test'}})
 tree=render();find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});await h.flush();tree=render()
 assert.equal(requests,1);assert.ok(find(tree,n=>n.type==='aside'&&n.props.role==='note'))
 find(tree,n=>n.type==='input'&&n.props.autoComplete==='one-time-code').props.onChange({target:{value:'123456'}})
 let inputs=[];function collect(n){if(Array.isArray(n))return n.forEach(collect);if(n&&typeof n==='object'){if(n.type==='input'&&n.props.type==='password')inputs.push(n);collect(n.props?.children)}}collect(tree)
 inputs[0].props.onChange({target:{value:'new-password'}});inputs[1].props.onChange({target:{value:'different-password'}})
 tree=render();find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});await h.flush();tree=render()
 assert.equal(updates,0);assert.ok(JSON.stringify(tree).includes('auth.reset.mismatch'))
 inputs[1].props.onChange({target:{value:'new-password'}});tree=render();find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});await h.flush();tree=render()
 assert.equal(updates,1);assert.ok(JSON.stringify(tree).includes('auth.reset.successTitle'))
})
