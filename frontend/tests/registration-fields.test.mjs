import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from '../test-support/component-harness.mjs'
const fields=load('frontend/src/lib/auth/registration-fields.ts')
const valid={firstName:'Đorđe',lastName:'Petrović',email:'ime+shop@example.com',phone:'064 123 4567',password:'long-password',postalCode:'11000',city:'Beograd',notes:'',consent:true}
test('registration validates required fields, email, phone, password, postal code and explicit consent',()=>{
 assert.equal(Object.keys(fields.registrationErrors(valid)).length,0)
 for(const key of ['firstName','lastName','email','phone','password','postalCode']) assert.equal(fields.registrationErrors({...valid,[key]:''})[key],'required')
 for(const [key,value] of Object.entries({email:'bad@',phone:'123',password:'short',postalCode:'1234',consent:false})) assert.equal(fields.registrationErrors({...valid,[key]:value})[key],key)
})
test('phone formatting accepts local, international and pasted numbers without losing foreign numbers',()=>{
 for(const value of ['0641234567','+381 (64) 123-4567','00381641234567']) {
  assert.equal(fields.normalizePhone(value),'+381641234567')
  assert.equal(fields.formatPhone(value),'+381 64 123 4567')
 }
 assert.equal(fields.normalizePhone('+49 151 12345678'),'+4915112345678')
 assert.equal(fields.normalizePhone(fields.formatPhone('+3816412345678901')),'+3816412345678901')
 assert.equal(fields.formatPhone(''),'')
})
