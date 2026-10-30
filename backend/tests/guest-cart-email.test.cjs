const {test}=require('node:test')
const assert=require('node:assert/strict')
require('ts-node/register/transpile-only')
const {Modules}=require('@medusajs/framework/utils')
const {clearGuestCartEmail,restoreGuestCartEmail}=require('../src/utils/guest-cart-email')
function fixture(patch={},hasAccount=false){
 const cart={id:'cart_test',email:'old@example.test',customer_id:'cus_guest',...patch},updates=[]
 const container={resolve:key=>key===Modules.CART?{retrieveCart:async()=>cart,updateCarts:async(id,data)=>{updates.push({id,...data});Object.assign(cart,data)}}:{retrieveCustomer:async()=>({has_account:hasAccount})}}
 return {cart,updates,container}
}
test('clearing guest email detaches customer without modifying it and supports workflow compensation',async()=>{
 const f=fixture(),old=await clearGuestCartEmail(f.container,f.cart.id)
 assert.equal(f.cart.email,null);assert.equal(f.cart.customer_id,null)
 await restoreGuestCartEmail(f.container,old)
 assert.equal(f.cart.email,'old@example.test');assert.equal(f.cart.customer_id,'cus_guest')
})
test('guest cart without a customer can omit email repeatedly',async()=>{
 const f=fixture({email:null,customer_id:null})
 await clearGuestCartEmail(f.container,f.cart.id);await clearGuestCartEmail(f.container,f.cart.id)
 assert.equal(f.cart.email,null);assert.equal(f.cart.customer_id,null)
})
test('registered customer and completed cart cannot be cleared',async()=>{
 for(const f of [fixture({},true),fixture({completed_at:new Date()})]){
  await assert.rejects(clearGuestCartEmail(f.container,f.cart.id));assert.equal(f.updates.length,0)
 }
})
