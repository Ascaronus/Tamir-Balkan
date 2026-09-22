import test from 'node:test'
import assert from 'node:assert/strict'
import {load,hooks,find} from '../test-support/component-harness.mjs'
test('signup waits for code, shows prominent spam reminder and cooldown, then activates and redirects',async()=>{
 const h=hooks();let requests=0,signups=0,redirect,submitted
 const c=load('frontend/src/components/auth/RegisterForm.tsx',{
  react:h.react,'next/link':'Link','next/navigation':{useRouter:()=>({push:path=>redirect=path})},
  '@/components/security/Captcha':{useCaptcha:()=>({requestCaptcha:async()=> 'captcha',captcha:null})},
  '@/lib/reviews/client':{reviewErrorKey:()=> 'error'},
  '@/components/i18n/LocaleProvider':{useTranslations:()=>k=>k},
  '@/components/auth/AuthProvider':{useAuth:()=>({isMutating:false,signup:async p=>{signups++;submitted=p}})},
  '@/lib/auth/auth-client':{requestRegistrationCode:async()=>{requests++;return {challenge_id:'challenge',retry_after:60}}},
 },{window:{setInterval:()=>1,clearInterval(){}}})
 const render=()=>h.render(()=>c.RegisterForm({countryCode:'rs'}))
 let tree=render()
 find(tree,n=>n.type==='input'&&n.props.type==='email').props.onChange({target:{value:'TEST@example.test'}})
 tree=render();await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=render()
 assert.equal(requests,1);assert.equal(signups,0);assert.equal(redirect,undefined)
 const spam=find(tree,n=>n.type==='aside'&&n.props.role==='note')
 assert.ok(JSON.stringify(spam).includes('auth.code.spamTitle'));assert.ok(spam.props.className.includes('border-2'))
 assert.equal(find(tree,n=>n.type==='button'&&n.props.children==='auth.code.resendWait').props.disabled,true)
 find(tree,n=>n.type==='input'&&n.props.autoComplete==='one-time-code').props.onChange({target:{value:'12ab3456'}})
 tree=render();await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}})
 assert.equal(signups,1);assert.equal(submitted.code,'123456');assert.equal(submitted.challenge_id,'challenge')
 assert.equal(redirect,'/rs/account')
})
test('client does not login or persist credentials until server verifies code',async()=>{
 const calls=[];let verified=false
 const client=load('frontend/src/lib/auth/auth-client.ts',{
  '@/lib/medusa':{sdk:{client:{fetch:async(path)=>{calls.push(path);if(path.endsWith('/verify')){if(!verified)throw Error('CODE_INVALID');return {verified:true}};return {customer:{id:'c'}}}},auth:{login:async()=>{calls.push('login');return 'jwt'}}}},
  './auth-storage':{setAuthToken:()=>calls.push('save')},'@/lib/cart/cart-storage':{},
 })
 const params={email:'test@example.test',password:'test-password',code:'123456',challenge_id:'opaque'}
 await assert.rejects(client.signup(params),/CODE_INVALID/)
 assert.deepEqual(calls,['/store/registration/verify'])
 verified=true;await client.signup(params)
 assert.deepEqual(calls.slice(1),['/store/registration/verify','login','save','/store/customers/me'])
})
