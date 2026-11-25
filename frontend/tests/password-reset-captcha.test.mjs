import test from 'node:test'
import assert from 'node:assert/strict'
import {load} from '../test-support/component-harness.mjs'

// Сброс пароля стоит в том же периметре, что и регистрация: письмо не должно уйти
// раньше проверки CAPTCHA, иначе перебор почты обходит защиту провайдера.
function resetRoute({bypass,captcha}){
  const calls=[]
  const route=load('backend/src/api/store/password-reset/start/route.ts',{
    '../../../../utils/registration-code':{registrationEmail:()=>'qa@example.test'},
    '../../../../utils/password-reset':{issuePasswordReset:async(_db,_email,send)=>{calls.push('issue');await send('123456');return{challenge_id:'opaque'}}},
    '../../../../utils/captcha':{
      captchaBypassAccepted:()=>bypass,
      verifyCaptcha:async()=>{calls.push('captcha');if(captcha)throw Error(captcha)},
    },
    '../../../../utils/review-http':{rateLimit:async()=>calls.push('rate'),reviewDb:()=>({}),reviewFailure:()=>calls.push('rejected')},
    '../../../../utils/registration-email':{sendPasswordResetCode:async()=>calls.push('mail')},
  })
  const headers={host:'test.tamir.rs'}
  const body=bypass?{email:'qa@example.test',_qa_captcha_bypass:'qa-token'}:{email:'qa@example.test',captcha_token:'token'}
  return route.POST({body,headers},{setHeader(){},json:()=>calls.push('response')}).then(()=>calls)
}

test('a normal request checks CAPTCHA before sending the reset code',async()=>{
  assert.deepEqual(await resetRoute({bypass:false,captcha:null}),['rate','captcha','rate','issue','mail','response'])
})

test('a failing CAPTCHA check stops the reset code',async()=>{
  assert.deepEqual(await resetRoute({bypass:false,captcha:'CAPTCHA_FAILED'}),['rate','captcha','rejected'])
})

test('a request the QA CAPTCHA guard accepts sends the code without the provider check',async()=>{
  assert.deepEqual(await resetRoute({bypass:true,captcha:'CAPTCHA_FAILED'}),['rate','rate','issue','mail','response'])
})
