import test from 'node:test'
import assert from 'node:assert/strict'
import {load, hooks, find} from '../test-support/component-harness.mjs'
const formatting=load('frontend/src/lib/auth/registration-fields.ts')
const checkout=load('frontend/src/lib/checkout/checkout-fields.ts',{'@/lib/auth/registration-fields':formatting})
const validation=load('frontend/src/lib/auth/profile-fields.ts',{'@/lib/checkout/checkout-fields':checkout})
const valid={firstName:'Igor',lastName:'Test',phone:'0641234567',city:'',postalCode:'',address1:'',notes:''}
test('profile allows contacts alone, but validates complete delivery address and phone',()=>{
 assert.equal(Object.keys(validation.profileErrors(valid)).length,0)
 assert.equal(validation.profileErrors({...valid,city:'Novi Sad'}).postalCode,'required')
 assert.equal(validation.profileErrors({...valid,postalCode:'abc'}).postalCode,'postalCode')
 assert.equal(validation.profileErrors({...valid,phone:'12'}).phone,'phone')
 assert.equal(validation.profileErrors({...valid,notes:'x'.repeat(1001)}).notes,'length')
})
test('unknown saved city remains editable and invalid input cannot update profile',async()=>{
 const h=hooks();let updates=0,focused
 const customer={id:'customer',email:'profile@example.com'}
 const form=load('frontend/src/components/auth/AccountProfileForm.tsx',{
 react:h.react,'@/components/auth/AuthProvider':{useAuth:()=>({customer,refresh:async()=>{}})},
 '@/components/i18n/LocaleProvider':{useTranslations:()=>k=>k},
 '@/lib/auth/registration-fields':formatting,'@/lib/auth/profile-fields':validation,
 '@/lib/checkout/apply-customer':{customerToCheckoutForm:()=>({...valid,email:customer.email,country:'rs',city:'Mali Iđoš',postalCode:'24321',address1:'Test 1'}),getDefaultAddressId:()=>null},
 '@/lib/auth/auth-client':{retrieveCustomer:async()=>customer,updateCustomerProfile:async()=>{updates++},upsertCustomerShippingAddress:async()=>{updates++}},
 },{document:{getElementById:id=>({focus(){focused=id}})}})
 const render=()=>h.render(()=>form.AccountProfileForm({countryCode:'rs'}))
 render();await h.flush();let tree=render()
 assert.equal(find(tree,n=>n.props?.id==='profile-city').props.value,'Mali Iđoš')
 assert.equal(find(tree,n=>n.props?.id==='profile-city-choice').props.value,'__other')
 find(tree,n=>n.props?.id==='profile-phone').props.onChange({target:{value:'12'}})
 tree=render();await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}})
 assert.equal(updates,0);assert.equal(focused,'profile-phone')
 assert.equal(find(render(),n=>n.props?.id==='profile-phone').props['aria-invalid'],true)
})
